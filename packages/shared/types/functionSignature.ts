export type FunctionScalarType = 'integer' | 'number' | 'string' | 'boolean';

export type CanonicalFunctionTypeNode =
  | { type: FunctionScalarType }
  | { type: 'array'; items: CanonicalFunctionTypeNode }
  | { type: 'nullable'; value: CanonicalFunctionTypeNode };

export type LegacyFunctionTypeNode =
  | { type: FunctionScalarType }
  | { type: 'array'; items: FunctionScalarType };

export interface CanonicalFunctionArgument {
  name: string;
  type: CanonicalFunctionTypeNode;
}

export interface LegacyFunctionArgument {
  name: string;
  type: FunctionScalarType | 'array';
  items?: FunctionScalarType;
}

export interface CanonicalFunctionSignature {
  name: string;
  args: CanonicalFunctionArgument[];
  returnType: CanonicalFunctionTypeNode;
}

export interface LegacyFunctionSignature {
  name: string;
  args: LegacyFunctionArgument[];
  returnType: LegacyFunctionTypeNode;
}

export type FunctionTypeNode = CanonicalFunctionTypeNode | LegacyFunctionTypeNode;
export type FunctionArgument = CanonicalFunctionArgument | LegacyFunctionArgument;
export type FunctionSignature = CanonicalFunctionSignature | LegacyFunctionSignature;

export type FunctionStarterCodeByLanguage = Partial<Record<'cpp' | 'java' | 'python', string>>;
