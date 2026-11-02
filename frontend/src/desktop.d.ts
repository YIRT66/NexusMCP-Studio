export {};
declare global {
  interface Window {
    nexusDesktop?: {
      revealPath?:(path:string)=>Promise<boolean>;
      getRuntimeURL:()=>Promise<string|null>;
      openDsh?:()=>Promise<void>;openBrowserPlugin:()=>Promise<string>;
      webchat:(operation:string,data?:unknown)=>Promise<any>;
      browserBounds:(rect:{x:number;y:number;width:number;height:number}|null)=>void;
      onWebchat:(callback:(event:{type:string;data:any})=>void)=>()=>void;
      ready: () => void;
      copyText: (text:string) => Promise<boolean>;
      setTheme: (theme: 'dark' | 'light') => void;
      selectExtensionPath: (directory?: boolean) => Promise<string | null>;
      selectWorkspacePath: () => Promise<string | null>;
      selectAttachments: () => Promise<string[]>;
      getWorkspacePath: () => Promise<string | null>;
      saveArchive: (bytes: Uint8Array, name: string) => Promise<string | null>;
    };
  }
}
