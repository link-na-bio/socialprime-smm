-- ==========================================================
-- SCRIPT DE CONFIGURAÇÃO - SOCIALPRIME (FLUXO PIX MANUAL)
-- EXECUTE ESTE SCRIPT NO SQL EDITOR DO SUPABASE SE NECESSÁRIO
-- ==========================================================

-- 1. Tabela de Notificações para o Admin
CREATE TABLE IF NOT EXISTS public.notificacoes_admin (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  order_id TEXT,
  pacote TEXT,
  mensagem TEXT,
  lida BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.notificacoes_admin ENABLE ROW LEVEL SECURITY;

-- 2. Tabela de Mensagens (Chat Admin-Cliente)
CREATE TABLE IF NOT EXISTS public.mensagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Remetente
  to_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE, -- Destinatário
  order_id TEXT,
  conteudo TEXT,
  tipo TEXT DEFAULT 'texto', -- 'texto' ou 'comprovante'
  lida BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS
ALTER TABLE public.mensagens ENABLE ROW LEVEL SECURITY;

-- 3. Habilitar Realtime para escuta ao vivo
BEGIN;
  DO $$ 
  BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
      CREATE PUBLICATION supabase_realtime;
    END IF;
  END $$;
  
  -- Tenta adicionar as tabelas à publicação (ignora erro se já estiverem adicionadas)
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notificacoes_admin;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens;
  ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
COMMIT;

-- 4. Políticas de RLS (Segurança)

-- NOTIFICAÇÕES: Admin pode ver e editar. Usuário pode inserir.
CREATE POLICY "Admins can manage notifications" 
ON public.notificacoes_admin
FOR ALL 
TO authenticated 
USING (
  (auth.jwt() ->> 'email' IN ('brunomeueditor@gmail.com'))
) 
WITH CHECK (
  (auth.jwt() ->> 'email' IN ('brunomeueditor@gmail.com'))
);

CREATE POLICY "Users can create their own notifications" 
ON public.notificacoes_admin 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

-- MENSAGENS: Remetente e Destinatário controlam a visibilidade.
CREATE POLICY "Users can read own messages" 
ON public.mensagens 
FOR SELECT 
TO authenticated 
USING (auth.uid() = user_id OR auth.uid() = to_user_id OR auth.jwt() ->> 'email' = 'brunomeueditor@gmail.com');

CREATE POLICY "Users can send messages" 
ON public.mensagens 
FOR INSERT 
TO authenticated 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Recipients can mark as read" 
ON public.mensagens 
FOR UPDATE 
TO authenticated 
USING (auth.uid() = to_user_id) 
WITH CHECK (auth.uid() = to_user_id);

-- 5. Storage (Bucket de Comprovantes)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('comprovantes_pix', 'comprovantes_pix', false)
ON CONFLICT (id) DO NOTHING;

-- Políticas de Storage para o Bucket 'comprovantes_pix'
CREATE POLICY "Users can upload their own receipts" 
ON storage.objects 
FOR INSERT 
TO authenticated 
WITH CHECK (
  bucket_id = 'comprovantes_pix' AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Users can view their own receipts" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (
  bucket_id = 'comprovantes_pix' AND (storage.foldername(name))[1] = auth.uid()::text
);

CREATE POLICY "Admins can see everything" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (
  bucket_id = 'comprovantes_pix' AND auth.jwt() ->> 'email' = 'brunomeueditor@gmail.com'
);
