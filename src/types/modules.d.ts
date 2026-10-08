declare module 'bpmn-moddle' {
  export class BpmnModdle {
    constructor(packages?: Record<string, any>, options?: Record<string, any>);
    create(type: string, attrs?: Record<string, any>): any;
    fromXML(xmlStr: string, options?: Record<string, any>): Promise<{
      rootElement: any;
      elementsById?: Record<string, any>;
      references?: any[];
      warnings?: Array<{ message: string; error?: any }>;
    }>;
    toXML(element: any, options?: Record<string, any>): Promise<{ xml: string }>;
  }
}

declare module 'bpmn-auto-layout' {
  export function layoutProcess(xml: string): Promise<string>;
}
