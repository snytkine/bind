import {
    IocComponentType,
    _COMPONENT_TYPE_,
    _COMPONENT_SCOPE_,
    _DEFAULT_SCOPE_,
    _COMPONENT_IDENTITY_,
    Target,
    IfComponentFactoryMethod,
    setComponentIdentity,
    defineMetadataUnique,
    getComponentName,
    IocComponentScope
} from "../";
import {Identity} from "../metadata/index";


const debug = require('debug')('bind:decorator:factory');
const TAG = '@Factory';

/**
 * Factory decorator can be applied only to class
 * Factory cannot be a named component. Name is always inferred from class name
 *
 * @param target class
 * @constructor
 */
export function Factory(target: Object) {

    let componentName, className;
    /**
     * Since factory components are not names expliciely, the componentName and className are the same,
     * the name of the class is used
     */
    componentName = className = getComponentName(target);
    debug(`Defining unnamed ${TAG} for class "${componentName}"`);

    setComponentIdentity(new Identity(componentName, target, className), target);
    defineMetadataUnique(_COMPONENT_TYPE_, IocComponentType.FACTORY, target);
    defineMetadataUnique(_DEFAULT_SCOPE_, IocComponentScope.SINGLETON, target);
    /**
     * Must also define _SCOPE_ with value of SINGLETON because Factory must always be singleton
     * component. Defining this score now will prevent adding @Scope annotation on Factory component
     */
    defineMetadataUnique(_COMPONENT_SCOPE_, IocComponentScope.SINGLETON, target);
}