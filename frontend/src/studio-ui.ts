export type ComponentRenderer=(value:Record<string,unknown>,container:HTMLElement)=>void|(()=>void);
export const componentRenderers=new Map<string,ComponentRenderer>();
export const notifyComponents=()=>window.dispatchEvent(new Event('nexus:components'));
