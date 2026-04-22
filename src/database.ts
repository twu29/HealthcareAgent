import 'dotenv/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env');
}

const supabase: SupabaseClient = createClient(url, key, {
  auth: { persistSession: false },
});

export async function saveMessage(sender: string, role: string, content: string): Promise<void> {
  const { error } = await supabase
    .from('messages')
    .insert({ sender, role, content });
  if (error) throw new Error(`saveMessage failed: ${error.message}`);
}

export async function getHistory(
  sender: string,
  limit: number = 30
): Promise<{ role: string; content: string }[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('role, content, id')
    .eq('sender', sender)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getHistory failed: ${error.message}`);
  return (data ?? []).reverse().map(({ role, content }) => ({ role, content }));
}

export type SavedDocument = {
  id: number;
  filename: string;
  mime_type: string | null;
  size_bytes: number;
  extracted_text: string;
  skipped_reason: string | null;
  created_at: string;
};

export async function saveDocument(
  sender: string,
  filename: string,
  mimeType: string | undefined,
  sizeBytes: number,
  extractedText: string,
  skippedReason?: string
): Promise<void> {
  const { error } = await supabase.from('documents').insert({
    sender,
    filename,
    mime_type: mimeType ?? null,
    size_bytes: sizeBytes,
    extracted_text: extractedText,
    skipped_reason: skippedReason ?? null,
  });
  if (error) throw new Error(`saveDocument failed: ${error.message}`);
}

export async function getDocumentsBySender(
  sender: string,
  limit: number = 10
): Promise<SavedDocument[]> {
  const { data, error } = await supabase
    .from('documents')
    .select('id, filename, mime_type, size_bytes, extracted_text, skipped_reason, created_at')
    .eq('sender', sender)
    .order('id', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`getDocumentsBySender failed: ${error.message}`);
  return (data ?? []) as SavedDocument[];
}