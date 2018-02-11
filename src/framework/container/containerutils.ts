import {
    IfIocContainer,
    IfComponentDetails,
    IocComponentScope,
    IocComponentType,
    Target
} from "../../";
import {getComponentMeta} from "./getcomponentmeta";
import {IfComponentFactoryMethod} from "../../definitions/container";
import {StringOrSymbol} from "../../definitions/types";

const TAG = "CONTAINER_UTILS";
const debug = require("debug")("bind:container");

/**
 *
 * @param {IfIocContainer<T>} container
 * @param {ObjectConstructor} clazz
 */
export function addSingletonComponent<T>(container: IfIocContainer<T>, clazz: Target): void {

    const meta = getComponentMeta(clazz);
    debug(TAG, "Adding singleton component=", meta.identity.componentName);

    /**
     * Return a function that has closer-based singleton instance
     * @type {(ctnr: IfIocContainer<T>, ctx?: T) => (any | IfComponentPropDependency)}
     */
    const getter = function (componentMeta) {
        const name = componentMeta.identity.componentName;
        let instance: any;

        /**
         * Getter of Singleton component
         * does not take context as second param
         */
        return function (ctnr: IfIocContainer<T>) {
            debug(TAG, "Getter called for Singleton component=", name);
            if (instance) {
                debug(TAG, "Returning same instance of component=", name);
                return instance;
            }

            debug(TAG, "Creating new instance of Singleton component' ", name, "' with constructor args", componentMeta.constructorDependencies);
            const constructorArgs = componentMeta.constructorDependencies.map(
                _ => ctnr.getComponent(_.dependency.componentName));
            //instance = new clazz(...constructorArgs);
            instance = Reflect.construct(<ObjectConstructor>clazz, constructorArgs);

            debug(TAG, "Adding dependencies to Singleton component' ", name, "' ", componentMeta.propDependencies);

            /**
             * Have instance object
             * now set properties with prop dependency instances
             *
             * The instance that was set via close will get its props set
             * and will also be returned
             */
            return componentMeta.propDependencies.reduce((prev, curr) => {
                prev[curr.propertyName] = ctnr.getComponent(curr.dependency.componentName);

                return prev;
            }, instance);
        };
    }(meta);

    const component = {
        ...meta,
        get: getter
    };

    container.addComponent(component);

}


export function addContextComponent<T>(container: IfIocContainer<T>, clazz: Target): void {

    const meta = getComponentMeta(clazz);
    debug(TAG, "Adding singleton component=", meta.identity.componentName);

    const getter = function(ctnr: IfIocContainer<T>, ctx: T)  {

        /**
         * Look in ctx first if found return it
         * otherwise create new one using deps from ctnr and ctx
         * and set result in ctx.components
         */

    };

    const component = {
        ...meta,
        get: getter
    };

    container.addComponent(component);
}


/**
 *
 * @param {IfIocContainer<T>} container
 * @param {ObjectConstructor} clazz
 */
export function addPrototypeComponent<T>(container: IfIocContainer<T>, clazz: Target): void {

    const componentMeta = getComponentMeta(clazz);
    debug(TAG, "Adding prototype component=", componentMeta.identity.componentName);

    const getter = function(ctnr: IfIocContainer<T>, ctx: T) {
        const name = componentMeta.identity.componentName;

        debug(TAG, "Creating new instance of component' ", name, "' with constructor args", componentMeta.constructorDependencies, " with ctx=", !!ctx);
        const constructorArgs = componentMeta.constructorDependencies.map(
            _ => ctnr.getComponent(_.dependency.componentName, ctx));
        const instance = Reflect.construct(<ObjectConstructor>clazz, constructorArgs);

        debug(TAG, "Adding dependencies to NewInstance component' ", name, "' ", componentMeta.propDependencies);
        return componentMeta.propDependencies.reduce((prev, curr) => {
            prev[curr.propertyName] = ctnr.getComponent(curr.dependency.componentName, ctx);

            return prev;

        }, instance);

    };

    const component = {
        ...componentMeta,
        get: getter
    };

    container.addComponent(component);
}

/**
 *
 * @param {IfIocContainer<T>} container
 * @param {ObjectConstructor} clazz
 */
export function addFactoryComponent<T>(container: IfIocContainer<T>, clazz: Target): void {

    /**
     * Then create a component for every factory method,
     * create getter function for it
     * and add it to container
     */
    const componentMeta: IfComponentDetails<T> = getComponentMeta(clazz);

    debug(TAG, "Adding Factory component=", componentMeta.identity.componentName);

    addSingletonComponent(container, clazz);


    /**
     * First add the factory component itself to container
     */
    if (componentMeta.provides.length === 0) {
        throw new TypeError(`Factory component ${componentMeta.identity.componentName} is not providing any components`);
    }

    componentMeta.provides.reduce((prev: IfIocContainer<T>, curr: IfComponentFactoryMethod) => {

        const providedComponent: IfComponentDetails<T> = {
            identity:                curr.providesComponent,
            componentType:           IocComponentType.COMPONENT,
            scope:                   IocComponentScope.SINGLETON,
            propDependencies:        [],
            constructorDependencies: [],
            provides:                []
        };

        const getter = function (factoryName: StringOrSymbol, factoryMethodName: string,
                                 componentName: StringOrSymbol) {

            let instance: any;

            return function (ctnr: IfIocContainer<T>, ctx?: T) {
                debug(TAG, "Getter called on Factory-Provided component=", componentName, " of factory=", factoryName);
                if (instance) {
                    debug(TAG, "Factory-Provided component=", componentName, " already created. Returning same instance");

                    return instance;
                }

                /**
                 * Factory Component is always singleton? Yes for now
                 * but not sure if there is any possibility to have ContextScoped factory
                 * Maybe in the future there could be a SessionScoped factory, then
                 * we will have to pass ctx param since it will contain means to get
                 * session-scoped objects
                 * @type {any}
                 */
                const factory = ctnr.getComponent(factoryName, ctx);
                debug(TAG, "Calling factory method=", factoryMethodName, " of factory=", factoryName);
                instance = factory[factoryMethodName]();

                return instance;

            };

        }(componentMeta.identity.componentName, curr.methodName, curr.providesComponent.componentName);

        const component = {
            ...providedComponent,
            get: getter
        };

        debug(TAG, "Adding factory-provided component=", component.identity.componentName);

        prev.addComponent(component);

        return prev;

    }, container);

}


export function addComponent<T>(container: IfIocContainer<T>, clazz: Target): void {

    const meta = getComponentMeta(clazz);

    if (meta.componentType === IocComponentType.FACTORY) {
        return addFactoryComponent(container, clazz);
    } else if (meta.scope === IocComponentScope.SINGLETON) {
        return addSingletonComponent(container, clazz);
    } else if (meta.scope === IocComponentScope.NEWINSTANCE) {
        return addPrototypeComponent(container, clazz);
    } else {
        throw new TypeError(`Unable to add component. ${JSON.stringify(meta)}`);
    }
}



