export type ScalarTypeName = 'int' | 'long' | 'double' | 'bool' | 'string';

export interface ScalarTypeDescriptor {
  kind: 'scalar';
  name: ScalarTypeName;
}

export interface ArrayTypeDescriptor {
  kind: 'array';
  element: ScalarTypeName;
}

export interface MatrixTypeDescriptor {
  kind: 'matrix';
  element: ScalarTypeName;
}

export type FunctionValueTypeDescriptor =
  | ScalarTypeDescriptor
  | ArrayTypeDescriptor
  | MatrixTypeDescriptor;

export interface FunctionParameter {
  name: string;
  type: FunctionValueTypeDescriptor;
}

export interface FunctionSignature {
  methodName: string;
  parameters: FunctionParameter[];
  returnType: FunctionValueTypeDescriptor;
}

export type FunctionStarterCodeByLanguage = Partial<Record<'cpp' | 'java' | 'python', string>>;
