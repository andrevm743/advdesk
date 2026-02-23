"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Scale, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { signIn } from "@/lib/firebase/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const loginSchema = z.object({
  email: z.string().email("E-mail inválido"),
  password: z.string().min(6, "Senha deve ter no mínimo 6 caracteres"),
});

type LoginForm = z.infer<typeof loginSchema>;

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") ?? "/dashboard";
  const [isLoading, setIsLoading] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  async function onSubmit(data: LoginForm) {
    setIsLoading(true);
    try {
      await signIn(data.email, data.password);
      router.replace(redirect);
    } catch (err: unknown) {
      const message =
        err instanceof Error && err.message.includes("invalid-credential")
          ? "E-mail ou senha incorretos"
          : "Erro ao fazer login. Tente novamente.";
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="email">E-mail</Label>
        <Input
          id="email"
          type="email"
          placeholder="seu@email.com"
          autoComplete="email"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Senha</Label>
        <Input
          id="password"
          type="password"
          placeholder="••••••••"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>
      <Button type="submit" className="w-full" disabled={isLoading}>
        {isLoading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Entrando...
          </>
        ) : (
          "Entrar"
        )}
      </Button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <Card className="border-border/50 shadow-2xl">
      <CardHeader className="text-center pb-2">
        <div className="flex justify-center mb-4">
          <div className="flex items-center gap-2 bg-primary/10 px-4 py-2 rounded-lg">
            <Scale className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold text-primary tracking-wider">ADVDESK</span>
          </div>
        </div>
        <CardTitle className="text-2xl">Bem-vindo de volta</CardTitle>
        <CardDescription>Entre com suas credenciais para acessar o sistema</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <Suspense fallback={<div className="h-48 flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>}>
          <LoginForm />
        </Suspense>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Plataforma jurídica com IA — uso interno do escritório
        </p>
      </CardContent>
    </Card>
  );
}
