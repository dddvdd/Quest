import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!url || !publishableKey) {
  throw new Error('Supabase configuration is missing. Copy .env.example to .env.local and provide the project URL and publishable key.')
}

export const supabase = createClient(url, publishableKey)
