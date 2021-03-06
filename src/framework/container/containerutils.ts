import {
  IfComponentDetails,
  IfIocContainer,
  IocComponentGetter,
  IScopedComponentStorage,
  IfComponentFactoryMethod,
  IfIocComponent,
  Maybe,
  isDefined,
} from '../../definitions';

import { ComponentScope } from '../../enums';

import { getScope } from '../../decorators/scope';
import { UNNAMED_COMPONENT } from '../../consts';
import FrameworkError from '../../exceptions/frameworkerror';
import getComponentMeta from '../lib/getcomponentsmeta';
import assertNoPreDestroy from '../lib/assertnopredestroy';
import assertNoProvides from '../lib/assertnoprovides';
import assertNoPostConstruct from '../lib/assertnopostconstruct';
import { ComponentIdentity } from '../../utils/componentidentity';
import { Target } from '../../definitions/target';

const TAG = 'CONTAINER_UTILS';
const debug = require('debug')('bind:container');

export const getComponentNameFromIdentity = (identity: ComponentIdentity): string => {
  if (identity.componentName !== UNNAMED_COMPONENT) {
    return String(identity.componentName);
  }

  return identity?.clazz?.name || identity?.constructor?.name || String(UNNAMED_COMPONENT);
};

export const hasScopeAndScopeStorages = (
  meta: IfComponentDetails,
  arrStorages?: Array<IScopedComponentStorage>,
): boolean => {
  return (
    (meta.scope || meta.scope === 0) &&
    arrStorages &&
    Array.isArray(arrStorages) &&
    arrStorages.length > 0
  );
};

export const getScopedStorage = (
  meta: IfComponentDetails,
  arr?: Array<IScopedComponentStorage>,
): Maybe<IScopedComponentStorage> => {
  return hasScopeAndScopeStorages(meta, arr) && arr.find(storage => storage.scope === meta.scope);
};

export const findComponentInScopeStorage = (
  meta: IfComponentDetails,
  arr?: Array<IScopedComponentStorage>,
): Maybe<Object> => {
  let ret: Maybe<Object>;
  const componentStorage: Maybe<IScopedComponentStorage> = getScopedStorage(meta, arr);

  if (isDefined(componentStorage)) {
    const storedComponent = componentStorage.getComponent(meta.identity);
    if (storedComponent) {
      debug(
        '%s findComponentInScopeStorage() Component "%s" found in componentStorage="%s"',
        TAG,
        meta.identity,
        ComponentScope[componentStorage.scope],
      );

      ret = storedComponent;
    }
  }

  return ret;
};

/**
 * If component is not undefined and
 * if there is a ScopedComponentStorage that matches meta.scope
 * then add component to that storage, otherwise do nothing.
 *
 * @param meta: IfComponentDetails
 * @param component: Object | undefined
 * @param arr: Array<IScopedComponentStorage> | undefined
 */
export const addComponentToScopedStorage = (
  meta: IfComponentDetails,
  component: Maybe<Object>,
  arr?: Array<IScopedComponentStorage>,
): void => {
  if (isDefined(component)) {
    const scopedStorage = getScopedStorage(meta, arr);
    if (scopedStorage) {
      scopedStorage.setComponent(meta.identity, component);
    }
  }
};

/**
 * Given array of IScopedComponentStorage
 * attempt to find storage that has same scope as component's scope
 * then attempt to find component in that scoped storage
 * If found return instance from storage
 * If not found then create new instance with all dependencies found in container
 * then add to storage and return instance
 *
 * @param container
 * @param meta
 * @param arrStorages
 */
export const getComponentFromScopedStorages = (
  container: IfIocContainer,
  meta: IfComponentDetails,
  arrStorages?: Array<IScopedComponentStorage>,
): Maybe<Object> => {
  let ret: Maybe<Object> = findComponentInScopeStorage(meta, arrStorages);

  if (!isDefined(ret)) {
    /**
     * Create new instance
     */
    const constructorArgs = meta.constructorDependencies.map(depIdentity =>
      container.getComponent(depIdentity, arrStorages),
    );
    const instance = Reflect.construct(<ObjectConstructor>meta.identity.clazz, constructorArgs);

    debug(
      '%s Adding %d dependencies to NewInstance component="%s"',
      TAG,
      meta.propDependencies.length,
      meta.identity,
    );

    ret = meta.propDependencies.reduce((prev, curr) => {
      // eslint-disable-next-line no-param-reassign
      prev[curr.propertyName] = container.getComponent(curr.dependency, arrStorages);

      return prev;
    }, instance);

    /**
     * Now add ret to componentStorage and also return it
     */
    addComponentToScopedStorage(meta, ret as any, arrStorages);
  }

  return ret;
};

const addFactoryProvidedComponents = (
  factoryComponentMeta: IfComponentDetails,
  container: IfIocContainer,
): void => {
  if (
    factoryComponentMeta.provides &&
    Array.isArray(factoryComponentMeta.provides) &&
    factoryComponentMeta.provides.length > 0
  ) {
    debug(
      '%s Singleton component "%s" provides "%d" components. Adding them',
      TAG,
      getComponentNameFromIdentity(factoryComponentMeta.identity),
      (factoryComponentMeta.provides && factoryComponentMeta.provides.length) || 0,
    );

    factoryComponentMeta.provides.reduce((cntr: IfIocContainer, curr: IfComponentFactoryMethod) => {
      /**
       * Provided component is returned from a factory
       * component's method, so it's factory component's job
       * to instantiate the provided component and return it.
       * This means that factory provided component cannot have own
       * dependencies
       *
       * Every provided component must have extraDependencies with value set
       * to factory's identity.
       * This property will be necessary when checking dependency loop.
       *
       * provided component's scope is same as factory component's scope
       * Currently its the only option. In the future may consider allowing
       * factory components to have smaller scope than factory
       * For example if factory is Singleton then provided can be NewInstance or Request scoped
       * But provided component should not be allowed to be larger scoped than its' factory.
       */
      let providedComponentScope: ComponentScope = getScope(
        factoryComponentMeta.identity?.clazz,
        curr.methodName,
      );

      providedComponentScope = providedComponentScope || container.defaultScope;

      const providedComponent: IfComponentDetails = {
        identity: curr.providesComponent,
        scope: providedComponentScope,
        propDependencies: [],
        constructorDependencies: [],
        extraDependencies: [factoryComponentMeta.identity],
      };

      /**
       * Here the assumption is that a factory component
       * is a Singleton and as such does not need
       * array of scope storage to be passed to .getComponent()
       *
       * @returns function with
       */
      const getFactoryProvidedComponent = (function getFactoryProvidedComponent(
        c: IfIocContainer,
        factoryId: ComponentIdentity,
        methodName: string,
      ) {
        return () => {
          /**
           * Utilize the getter of factory component
           * That getter function is in scope so can be used here
           */
          const factory = c.getComponent(factoryId);
          debug(
            '%s Calling factory method="%s" of factory component="%s"',
            TAG,
            curr.methodName,
            getComponentNameFromIdentity(factoryId),
          );

          /**
           * Now we have the instance of factory component
           * just call the method that provides this component
           * to get the actual provided component.
           */
          return factory[methodName]();
        };
      })(container, factoryComponentMeta.identity, curr.methodName);

      let providedComponentGetter: IocComponentGetter;

      /**
       * providedComponentGetter function
       * will be different depending on
       * provided component's scope
       */
      switch (providedComponent.scope) {
        case ComponentScope.NEWINSTANCE:
          providedComponentGetter = () => getFactoryProvidedComponent();
          break;

        case ComponentScope.SINGLETON:
          providedComponentGetter = (function providedGetterSingleton() {
            let instance: Object;

            return () => {
              instance = instance || getFactoryProvidedComponent();
              return instance;
            };
          })();
          break;

        default:
          /**
           * Look in scopedComponentStorage that matches
           * ComponentScope.
           *
           * If not found in scope then use getFactoryProvidedComponent()
           * then put it into scope
           */
          providedComponentGetter = (function providedGetterScoped(componentDetails) {
            return (arrStorages?: Array<IScopedComponentStorage>) => {
              let component: Maybe<Object> = findComponentInScopeStorage(
                componentDetails,
                arrStorages,
              );
              if (!isDefined(component)) {
                component = getFactoryProvidedComponent();
                addComponentToScopedStorage(componentDetails, component as any, arrStorages);
              }
              return component;
            };
          })(providedComponent);
      }

      const component = {
        ...providedComponent,
        get: providedComponentGetter,
      };

      debug(
        '%s Adding factory-provided component="%s" scope="%s"',
        TAG,
        component.identity,
        component.scope,
      );

      cntr.addComponent(component);

      return cntr;
    }, container);
  }
};

/**
 * RequestLogger depends on Logger and on Request object
 * Request is RequestScoped
 *
 * getter function: look for object in RequestScopeStore
 * a) Found object -> return it
 * b) Not found: get dependencies from Container. Container will get Logger
 * will then need to get Request.
 * Container get Details of Request
 */

/**
 *
 * @param {IfIocContainer<T>} container
 * @param {ObjectConstructor} clazz
 */
export function addSingletonComponent(container: IfIocContainer, meta: IfComponentDetails): void {
  const name = getComponentNameFromIdentity(meta.identity);
  debug('%s addSingletonComponent "%s"', TAG, meta.identity);

  /**
   * Getter of Singleton component
   * does not take context as second param
   */
  const getter: IocComponentGetter = (function getterSingleton(ctnr: IfIocContainer) {
    let instance: any;

    /**
     * Singleton getter does not use
     * the scopedComponentStorage optional parameter
     * because singleton component cannot have dependencies
     * on scoped components, so passing scopedStorages is irrelevant
     *
     * and as such we don't add Array<IScopedComponentStorage>
     * as parameter to this getter
     */
    return function getterSingletonInner() {
      debug('%s Getter called for Singleton componentName="%s"', TAG, name);

      if (instance) {
        debug('%s Returning same instance of componentName="%s"', TAG, name);

        return instance;
      }

      debug(
        `%s Creating new instance of Singleton componentName="%s" with constructor args="%o"`,
        TAG,
        name,
        meta.constructorDependencies,
      );

      const constructorArgs = meta.constructorDependencies.map(dependency => {
        return ctnr.getComponent(dependency);
      });

      instance = Reflect.construct(<ObjectConstructor>meta.identity.clazz, constructorArgs);

      debug(
        '%s Adding dependencies to Singleton component "%s", dependencies="%o"',
        TAG,
        name,
        meta.propDependencies,
      );

      /**
       * Have instance object
       * now set properties with prop dependency instances
       *
       * The instance that was set via close will get its props set
       * and will also be returned
       */
      return meta.propDependencies.reduce((prev, curr) => {
        /**
         * Don't add if instance already has property with the same name
         * it could be the case with class inheritance where child class
         * redefined property but parent class has same property is annotated with @Inject
         *
         * @type {any}
         */
        if (!prev[curr.propertyName]) {
          // eslint-disable-next-line no-param-reassign
          prev[curr.propertyName] = ctnr.getComponent(curr.dependency);
        } else {
          debug(
            '%s Singleton component "%s" already has property="%s"',
            TAG,
            name,
            curr.propertyName,
          );
        }

        return prev;
      }, instance);
    };
  })(container);

  const component: IfIocComponent = {
    ...meta,
    get: getter,
  };

  container.addComponent(component);

  /**
   * This singleton component may also have component getters
   */
  addFactoryProvidedComponents(meta, container);
}

export function addScopedComponent(container: IfIocContainer, meta: IfComponentDetails): void {
  /**
   * Validate:
   * 1) scoped component cannot have non-empty 'provides'
   * 2) scoped component cannot have @PostConstruct and @PreDestroy methods
   */
  assertNoProvides(meta);
  assertNoPostConstruct(meta);
  assertNoPreDestroy(meta);

  debug('%s Adding scoped component="%s" scope="%s"', TAG, meta.identity, meta.scope);

  const getter: IocComponentGetter = (function scopedComponentGetter(cntnr: IfIocContainer) {
    return (arrStorages?: Array<IScopedComponentStorage>) => {
      return getComponentFromScopedStorages(cntnr, meta, arrStorages);
    };
  })(container);

  const component = {
    ...meta,
    get: getter,
  };

  container.addComponent(component);

  return undefined;
}

/**
 *
 * @param {IfIocContainer<T>} container
 * @param {ObjectConstructor} clazz
 */
export function addPrototypeComponent(container: IfIocContainer, meta: IfComponentDetails): void {
  /**
   * Validate
   * 1) Prototype component cannot have @PostConstruct and @PreDestroy
   * 2) cannot have non-empty .provides array
   */
  assertNoPreDestroy(meta);
  assertNoPostConstruct(meta);
  assertNoProvides(meta);

  debug(
    '%s Adding prototype component="%s" className="%s"',
    TAG,
    String(meta.identity.componentName),
    meta.identity?.clazz?.name,
  );

  const name = String(meta.identity.componentName);
  /**
   * Closure based function the ctnr is passed in
   * via immediately executed function
   *
   * @param ctnr IfIocContainer
   * @returns function that takes in optional array of IScopedComponentStorate
   * and returns constructed component
   */
  const getter: IocComponentGetter = (function prototypeGetter(ctnr: IfIocContainer) {
    return function getNewInstance(scopedComponentStorage?: Array<IScopedComponentStorage>) {
      debug(
        `%s Creating new instance of component="%s"
      with constructorArs="%o" with scopedComponentStorage="%s"`,
        TAG,
        meta.identity,
        meta.constructorDependencies,
        !!scopedComponentStorage,
      );

      const constructorArgs = meta.constructorDependencies.map(depIdentity =>
        ctnr.getComponent(depIdentity, scopedComponentStorage),
      );
      const instance = Reflect.construct(<ObjectConstructor>meta.identity.clazz, constructorArgs);

      debug(
        `%s Adding propDependencies="%o" to NewInstance component="%s"`,
        TAG,
        meta.propDependencies,
        meta.identity,
      );

      return meta.propDependencies.reduce((prev, curr) => {
        /**
         * Add prop dependency but ONLY if this property is not already set
         * It would be set if sub-class overrides parent where in parent
         * this property is auto-wired with @Inject but sub-class overrides it
         * with own value.
         */
        if (!prev[curr.propertyName]) {
          // eslint-disable-next-line no-param-reassign
          prev[curr.propertyName] = ctnr.getComponent(curr.dependency, scopedComponentStorage);
        } else {
          debug(
            '%s Instance component "%s" already has own property "%s"',
            TAG,
            name,
            curr.propertyName,
          );
        }

        return prev;
      }, instance);
    };
  })(container);

  const component = {
    ...meta,
    get: getter,
  };

  container.addComponent(component);
}

/**
 *
 * @param container
 * @param clazz Expected to be a Class of component
 * @param file string a full path to a file containing the class.
 * Multiple classes can share the same file because its allowed to declare more than
 * one component in a file
 */
export function addComponent(container: IfIocContainer, clazz: Target): void {
  const meta = getComponentMeta(clazz);

  const scope = meta?.scope || container.defaultScope;

  if (scope === ComponentScope.SINGLETON) {
    return addSingletonComponent(container, meta);
  }
  if (scope === ComponentScope.NEWINSTANCE) {
    return addPrototypeComponent(container, meta);
  }
  if (scope) {
    return addScopedComponent(container, meta);
  }
  throw new FrameworkError(`UNSUPPORTED_SCOPE_ERROR. 
    Unable to add component. ${meta && meta.identity} 
    with scope=${String(scope)}`);
}
