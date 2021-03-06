import { Map, OrderedSet, hash } from "immutable";

import { panic, setUnion, assert } from "./Support";

export class TypeAttributeKind<T> {
    public readonly combine: (a: T, b: T) => T;
    public readonly intersect: (a: T, b: T) => T;
    public readonly makeInferred: (a: T) => T | undefined;
    public readonly stringify: (a: T) => string | undefined;

    constructor(
        readonly name: string,
        private readonly _inIdentity: boolean,
        private readonly _uniqueIdentity: ((a: T) => boolean) | boolean,
        combine: ((a: T, b: T) => T) | undefined,
        intersect: ((a: T, b: T) => T) | undefined,
        makeInferred: ((a: T) => T | undefined) | undefined,
        stringify: ((a: T) => string | undefined) | undefined
    ) {
        if (combine === undefined) {
            combine = () => {
                return panic(`Cannot combine type attribute ${name}`);
            };
        }
        this.combine = combine;

        if (intersect === undefined) {
            intersect = combine;
        }
        this.intersect = intersect;

        if (makeInferred === undefined) {
            makeInferred = () => {
                return panic(`Cannot make type attribute ${name} inferred`);
            };
        }
        this.makeInferred = makeInferred;

        if (stringify === undefined) {
            stringify = () => undefined;
        }
        this.stringify = stringify;
    }

    requiresUniqueIdentity(a: T): boolean {
        const ui = this._uniqueIdentity;
        if (typeof ui === "boolean") {
            return ui;
        }
        return ui(a);
    }

    get inIdentity(): boolean {
        assert(this._uniqueIdentity !== true, "inIdentity is invalid for unique identity attributes");
        return this._inIdentity;
    }

    makeAttributes(value: T): TypeAttributes {
        const kvps: [this, T][] = [[this, value]];
        return Map(kvps);
    }

    tryGetInAttributes(a: TypeAttributes): T | undefined {
        return a.get(this);
    }

    private setInAttributes(a: TypeAttributes, value: T): TypeAttributes {
        return a.set(this, value);
    }

    modifyInAttributes(a: TypeAttributes, modify: (value: T | undefined) => T | undefined): TypeAttributes {
        const modified = modify(this.tryGetInAttributes(a));
        if (modified === undefined) {
            return a.remove(this);
        }
        return this.setInAttributes(a, modified);
    }

    combineInAttributes(a: TypeAttributes, value: T): TypeAttributes {
        return this.modifyInAttributes(a, v => (v === undefined ? value : this.combine(v, value)));
    }

    setDefaultInAttributes(a: TypeAttributes, makeDefault: () => T): TypeAttributes {
        if (this.tryGetInAttributes(a) !== undefined) return a;
        return this.modifyInAttributes(a, makeDefault);
    }

    equals(other: any): boolean {
        if (!(other instanceof TypeAttributeKind)) {
            return false;
        }
        return this.name === other.name;
    }

    hashCode(): number {
        return hash(this.name);
    }
}

export type TypeAttributes = Map<TypeAttributeKind<any>, any>;

export const emptyTypeAttributes: TypeAttributes = Map();

export type CombinationKind = "union" | "intersect";

export function combineTypeAttributes(kind: CombinationKind, attributeArray: TypeAttributes[]): TypeAttributes;
export function combineTypeAttributes(kind: CombinationKind, a: TypeAttributes, b: TypeAttributes): TypeAttributes;
export function combineTypeAttributes(
    combinationKind: CombinationKind,
    firstOrArray: TypeAttributes[] | TypeAttributes,
    second?: TypeAttributes
): TypeAttributes {
    const union = combinationKind === "union";
    let attributeArray: TypeAttributes[];
    let first: TypeAttributes;
    let rest: TypeAttributes[];
    if (Array.isArray(firstOrArray)) {
        attributeArray = firstOrArray;
        if (attributeArray.length === 0) return Map();
        first = attributeArray[0];
        rest = attributeArray.slice(1);
    } else {
        if (second === undefined) {
            return panic("Must have on array or two attributes");
        }
        first = firstOrArray;
        rest = [second];
    }
    return first.mergeWith((aa, ab, kind) => (union ? kind.combine(aa, ab) : kind.intersect(aa, ab)), ...rest);
}

export function makeTypeAttributesInferred(attr: TypeAttributes): TypeAttributes {
    return attr.map((value, kind) => kind.makeInferred(value)).filter(v => v !== undefined);
}

export const descriptionTypeAttributeKind = new TypeAttributeKind<OrderedSet<string>>(
    "description",
    false,
    false,
    setUnion,
    undefined,
    _ => OrderedSet(),
    descriptions => {
        let result = descriptions.first();
        if (result === undefined) return undefined;
        if (result.length > 5 + 3) {
            result = `${result.substr(0, 5)}...`;
        }
        if (descriptions.size > 1) {
            result = `${result}, ...`;
        }
        return result;
    }
);
export const propertyDescriptionsTypeAttributeKind = new TypeAttributeKind<Map<string, OrderedSet<string>>>(
    "propertyDescriptions",
    false,
    false,
    (a, b) => a.mergeWith(setUnion, b),
    undefined,
    _ => Map(),
    undefined
);
