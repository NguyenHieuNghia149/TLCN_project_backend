export interface ApiResponse<T = any> {
  success: boolean;
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: any;
  } | null;
}

export const successResponse = <T>(data: T): ApiResponse<T> => ({
  success: true,
  data,
  error: null,
});

export const errorResponse = (
  code: string,
  message: string,
  details: any = null
): ApiResponse<null> => ({
  success: false,
  data: null,
  error: {
    code,
    message,
    details,
  },
});
