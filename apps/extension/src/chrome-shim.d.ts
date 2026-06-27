// Minimal ambient declaration of the slice of the `chrome.*` MV3 API this probe
// uses. This exists ONLY so the extension's TypeScript is self-contained and
// type-checks WITHOUT running `npm install` in this worktree (a hard constraint
// of this track). The REAL, authoritative types are `@types/chrome`, which is
// declared as a devDependency in apps/extension/package.json. When the
// extension is built for real (with deps installed), `@types/chrome` supersedes
// this shim — delete or ignore this file at that point.
//
// Deliberately narrow: we declare only what we call, with loose-but-honest
// signatures, so an accidental misuse of an undeclared API still fails to compile.

declare namespace chrome {
  namespace runtime {
    const lastError: { message: string } | undefined;
    interface MessageSender {
      tab?: tabs.Tab;
      id?: string;
    }
    function sendMessage<T = unknown>(message: unknown): Promise<T>;
    const onMessage: {
      addListener(
        callback: (
          message: any,
          sender: MessageSender,
          sendResponse: (response?: unknown) => void,
        ) => boolean | void | Promise<unknown>,
      ): void;
    };
    function getURL(path: string): string;
  }

  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      active: boolean;
    }
    function query(queryInfo: {
      active?: boolean;
      currentWindow?: boolean;
    }): Promise<Tab[]>;
  }

  namespace cookies {
    interface Cookie {
      name: string;
      value: string;
      domain: string;
    }
    function getAll(details: { domain?: string; url?: string }): Promise<Cookie[]>;
  }

  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null): Promise<Record<string, any>>;
      set(items: Record<string, any>): Promise<void>;
    }
    const local: StorageArea;
  }
}
