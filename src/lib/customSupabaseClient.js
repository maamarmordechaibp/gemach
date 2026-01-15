import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://tpamzkllvackvjhwzqng.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRwYW16a2xsdmFja3ZqaHd6cW5nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTY2NjA5MDQsImV4cCI6MjA3MjIzNjkwNH0.JyCv0HN5jQ9PZVsdY_hUXGSRLazS7WFio-dMiErtwTQ';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);