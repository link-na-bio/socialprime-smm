-- Create transactions table to track processed payments
CREATE TABLE IF NOT EXISTS public.transactions (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    payment_id text NOT NULL UNIQUE,
    user_id uuid REFERENCES auth.users(id),
    amount numeric NOT NULL,
    status text NOT NULL,
    created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- Allow users to view their own transactions
CREATE POLICY "Users can view own transactions"
    ON public.transactions FOR SELECT
    USING (auth.uid() = user_id);

-- Service role can do everything (for webhooks)
CREATE POLICY "Service role can manage transactions"
    ON public.transactions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
