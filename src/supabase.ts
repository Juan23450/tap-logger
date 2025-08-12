import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SB_URL as string
const anon = import.meta.env.VITE_SB_ANON as string

export const supabase = createClient(url, anon)
