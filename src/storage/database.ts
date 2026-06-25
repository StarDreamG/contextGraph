import Database from "better-sqlite3";

export type ContextGraphDatabase = Database.Database;

export function openDatabase(dbPath: string): ContextGraphDatabase {
  const db = new Database(dbPath);
  db.pragma("foreign_keys = ON");
  return db;
}
