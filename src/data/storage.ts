import { File } from 'expo-file-system';

import { supabase } from '../lib/supabase';

const BUCKET = 'receipts';

/**
 * Receipts live in a private bucket under `<group_id>/<uuid>.<ext>`. The
 * leading folder is what the storage RLS policy checks, so a receipt is
 * readable exactly by the group it belongs to — never by URL alone.
 */
export function receiptPath(groupId: string, uri: string): string {
  const extension = (uri.split('?')[0].split('.').pop() ?? 'jpg').toLowerCase();
  const safeExtension = /^(jpg|jpeg|png|heic|webp)$/.test(extension) ? extension : 'jpg';
  return `${groupId}/${globalThis.crypto?.randomUUID?.() ?? fallbackId()}.${safeExtension}`;
}

function fallbackId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function contentTypeFor(path: string): string {
  const extension = path.split('.').pop()?.toLowerCase();
  if (extension === 'png') return 'image/png';
  if (extension === 'heic') return 'image/heic';
  if (extension === 'webp') return 'image/webp';
  return 'image/jpeg';
}

/** Uploads a local image and returns the storage path to save on the expense. */
export async function uploadReceipt(groupId: string, localUri: string): Promise<string> {
  const path = receiptPath(groupId, localUri);
  const bytes = await new File(localUri).arrayBuffer();

  const { error } = await supabase.storage.from(BUCKET).upload(path, bytes, {
    contentType: contentTypeFor(path),
    upsert: false,
  });

  if (error) throw error;
  return path;
}

/**
 * Private bucket, so viewing needs a short-lived signed URL. Returns null
 * rather than throwing: a missing receipt should never break the ledger.
 */
export async function signedReceiptUrl(path: string, expiresInSeconds = 3600): Promise<string | null> {
  if (!path) return null;

  // Tolerate rows that stored a full URL from an earlier build.
  if (path.startsWith('http')) return path;

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expiresInSeconds);
  if (error) return null;
  return data?.signedUrl ?? null;
}

export async function deleteReceipt(path: string): Promise<void> {
  if (!path || path.startsWith('http')) return;
  await supabase.storage.from(BUCKET).remove([path]);
}
