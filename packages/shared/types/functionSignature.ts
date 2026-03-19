export type FunctionScalarType = 'integer' | 'string' | 'boolean';

export type FunctionTypeNode =
  | { type: FunctionScalarType }
  | { type: 'array'; items: FunctionScalarType };

export interface FunctionArgument {
  name: string;
  type: FunctionScalarType | 'array';
  items?: FunctionScalarType;
}

export interface FunctionSignature {
  name: string;
  args: FunctionArgument[];
  returnType: FunctionTypeNode;
}

export type FunctionStarterCodeByLanguage = Partial<Record<'cpp' | 'java' | 'python', string>>;


