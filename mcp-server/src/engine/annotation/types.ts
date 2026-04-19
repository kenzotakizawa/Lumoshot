import type { BoundingBox } from '../../types.js';

export interface AnnotationWarning {
  type: string;
  refs?: number[];
  message: string;
  adjusted?: boolean;
  from?: {
    tail?: string;
    bbox?: BoundingBox;
  };
  to?: {
    tail?: string;
    bbox?: BoundingBox;
  };
}

