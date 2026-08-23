import type { PGlite } from "@electric-sql/pglite";

export declare const MIGRATIONS_DIR: string;

export declare function listMigrations(): Promise<string[]>;
export declare function createTestDb(opts?: { log?: boolean }): Promise<PGlite>;
export declare function createSeededDb(opts?: { log?: boolean }): Promise<PGlite>;
export declare function setupRoles(db: PGlite): Promise<void>;
export declare function actAs(db: PGlite, userId: string | null): Promise<void>;
export declare function actAsService(db: PGlite): Promise<void>;
export declare function loginAs(
  db: PGlite,
  email: string,
): Promise<{ profileId: string; userId: string }>;
