import {
    _COMPONENT_META_TYPE_,
    _COMPONENT_TYPE_,
    getComponentIdentity,
    getScope,
    getFactoryMethods,
    getConstructorDependencies,
    getPropDependencies,
    IfComponentDetails,
    getPredestroy,
    getPostConstruct,
    Target
} from "../../";
import {StringOrSymbol} from "../../definitions/types";

export const getComponentMeta = <T>(clazz: Target, propertyKey?: StringOrSymbol): IfComponentDetails<T> => {

    return {
        identity: getComponentIdentity(clazz, propertyKey),
        componentType: Reflect.getMetadata(_COMPONENT_TYPE_, clazz, propertyKey),
        componentMetaType: Reflect.getMetadata(_COMPONENT_META_TYPE_, clazz, propertyKey),
        scope: getScope(clazz, propertyKey),
        propDependencies: getPropDependencies(clazz),
        constructorDependencies: getConstructorDependencies(clazz),
        provides: getFactoryMethods(clazz),
        preDestroy: getPredestroy(clazz),
        postConstruct: getPostConstruct(clazz)
    }
};
