import type { Canvas, TPointerEventInfo } from 'fabric';

export interface DrawTool {
    onMouseDown: (opt: TPointerEventInfo, canvas: Canvas) => void;
    onMouseMove: (opt: TPointerEventInfo, canvas: Canvas) => void;
    onMouseUp: (opt: TPointerEventInfo, canvas: Canvas) => void;
}

export interface DrawToolContext {
    strokeColor: string;
    strokeWidth: number;
    fontColor: string;
    fontSize: number;
    arrowStyle?: 'straight' | 'curved' | 'elbow';
    bubbleFillColor?: string;
    controlConfig: any;
    isDrawing: React.MutableRefObject<boolean>;
    startX: React.MutableRefObject<number>;
    startY: React.MutableRefObject<number>;
    currentShape: React.MutableRefObject<any>;
    blurCanvas?: HTMLCanvasElement | null;
    onToolComplete?: () => void;
    clickIconScheme?: 'dark' | 'light';
}
