import "reflect-metadata";
import {
    Target,
    _COMPONENT_IDENTITY_,
    INVALID_COMPONENT_NAMES,
    _COMPONENT_TYPE_,
    _DEFAULT_SCOPE_,
    RETURN_TYPE,
    IfComponentPropDependency,
    IocComponentType,
    IocComponentScope,
    defineMetadataUnique,
    IfCtorInject,
    IfComponentFactoryMethod
} from '../'

import {setComponentIdentity} from "../metadata/index";


/**
 * When @Component or @Factory is added to class
 * Component name is added to class as a hidden non-enumerable property (with Symbol as name)
 * Component scope is added to class as hidden non-enumerable property (with Symbol as name)
 * Component type (Component or ComponentFactory is added to class as hidden non-enumerable hidded property (with Symbol as name)
 * A Scope property must NOT be added ONLY if explicitly set with @Scope or @Singleton decorator, cannot be set
 * to initial default value.
 * But what about decorating controller? Controller in not Singleton by default but generic component IS singleton!
 * A component must also have _DEFAULT_SCOPE_
 * This way when a new component type needs to add component meta data (like controller) it must call
 * the addComponentDecoration with own _DEFAULT_SCOPE_ value.
 *
 *
 * When @Component is added to method or get accessor:
 *
 *
 * @type {debug.IDebugger | any}
 */

const debug = require('debug')('bind:decorator:component');
const TAG = '@Component';

/**
export type _Target = {
    new? (...args: any[]): any
    constructor: (...args: any[]) => any
    name?: string
    //constructor: any
    prototype?: any
}
 **/

/**
 * Get component metadata from class or object instance
 * @param target
 */
//export function getComponentMeta(target: any): IfComponentDetails {
//
//}

/**
 * Component decorator can be a factory - like @Component("my_stuff")
 * or Decorator function - simply a @Component
 * It can be applied to class or class method
 *
 * @param {Target} target
 * @constructor
 */
export function Component(target: Target): void

export function Component(target: Target, propertyKey: string, descriptor: TypedPropertyDescriptor<Object>): void

export function Component(name: string): (target: any, propertyKey?: string, descriptor?: TypedPropertyDescriptor<Object>) => void

export function Component(nameOrTarget: string | Target, propertyKey?: string, descriptor?: TypedPropertyDescriptor<Object>) {

    let componentName: string;
    let className: string;



    if (typeof nameOrTarget !== 'string') {
        componentName = className = nameOrTarget['name'];

        debug(`Entered @Component for unnamed component propertyKey="${propertyKey}"`);

        if (typeof nameOrTarget === "function" && !propertyKey && componentName && nameOrTarget['prototype']) {
            /**
             * Applying decorator to class
             */

            debug(`Defining unnamed ${TAG} for class ${componentName}`);

            setComponentIdentity({componentName, className}, nameOrTarget);
            defineMetadataUnique(_COMPONENT_TYPE_, IocComponentType.COMPONENT, nameOrTarget);
            defineMetadataUnique(_DEFAULT_SCOPE_, IocComponentScope.SINGLETON, nameOrTarget);

        } else {

            debug(`Defining unnamed ${TAG} for property ${propertyKey} of class ${nameOrTarget['name']}`);

            /**
             * Applying decorator to method of the class
             * In this case the target is a prototype of the class for instance member
             * or constructor function for a static member.
             *
             * We should not allow Component decorator on a static member.
             */
            if (!descriptor || typeof descriptor.value !== 'function') {
                throw new TypeError(`Only class or class method can have a '${TAG}'decorator. ${nameOrTarget.constructor.name}.${propertyKey} decorated with ${TAG} is NOT a class or method`);
            }

            /**
             * Decorating method with @Component but now need to extract component name based on return type.
             * If return type is not declared in typescript then we cannot proceed.
             *
             * If @Component is applied to class method that class method must declared return type like this:
             * Here the @Component was applied to accessor method without providing component name
             * so we must extract component name from return type.
             *
             * getCollection(): Collection {
             *  //return a collection instance.
             * }
             *
             */
            const rettype = Reflect.getMetadata(RETURN_TYPE, nameOrTarget, propertyKey);
            const RT = typeof rettype;

            if (RT != "function" || !rettype.name) {
                throw new TypeError(`Cannot add ${TAG} to property ${propertyKey}. ${TAG} decorator was used without a name and rettype is not an object: ${RT}`);
            }

            /**
             * @todo
             * Make sure that returntype is user-defined class and not a build-in like String, Object, etc.
             */
            if (INVALID_COMPONENT_NAMES.includes(rettype.name)) {
                throw new TypeError(`${TAG} Return type of method "${nameOrTarget.constructor.name}.${propertyKey}" 
                is not a valid name for a component: "${rettype.name}". 
                Possibly return type was not explicitly defined or the Interface name was used for return type instead of class name`)
            }

            componentName = className = rettype.name;

            setComponentIdentity({componentName, className}, nameOrTarget, propertyKey);
            defineMetadataUnique(_COMPONENT_TYPE_, IocComponentType.COMPONENT, nameOrTarget, propertyKey);
            defineMetadataUnique(_DEFAULT_SCOPE_, IocComponentScope.SINGLETON, nameOrTarget, propertyKey);

        }


    } else {
        debug(`${TAG} decorator Called with component name="${nameOrTarget}"`);
        componentName = nameOrTarget;
        return function (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {

            if (typeof target === "function" && !propertyKey) {
                className = target.name;

                debug(`Defining named ${TAG} '${componentName}' for class ${target.name}`);

                // Applying to target (without .prototype fails to get meta for the instance)
                //defineMetadataUnique(_COMPONENT_IDENTITY_, name, target);
                setComponentIdentity({componentName, className}, target);
                defineMetadataUnique(_COMPONENT_TYPE_, IocComponentType.COMPONENT, target);
                defineMetadataUnique(_DEFAULT_SCOPE_, IocComponentScope.SINGLETON, target)

            } else {
                /**
                 * This is a named component applied to method.
                 */
                const factoryClassName = target.constructor && target.constructor.name;

                if (typeof descriptor.value !== 'function') {
                    throw new TypeError(`Only class or class method can have a '${TAG}' decorator. ${target.constructor.name}.${propertyKey} decorated with ${TAG}('${componentName}') is NOT a class or method`);
                }

                debug(`Defining named ${TAG} "${componentName}" for class method "${factoryClassName}.${propertyKey}"`);

                /**
                 * Get return type of component getter method
                 */
                const rettype = Reflect.getMetadata(RETURN_TYPE, target, propertyKey);

                className = rettype && rettype.name;

                setComponentIdentity({componentName, className}, target, propertyKey);
                defineMetadataUnique(_COMPONENT_TYPE_, IocComponentType.COMPONENT, target, propertyKey);
                defineMetadataUnique(_DEFAULT_SCOPE_, IocComponentScope.SINGLETON, target, propertyKey);

            }

        }
    }
}
