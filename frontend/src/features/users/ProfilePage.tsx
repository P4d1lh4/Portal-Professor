import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { KeyRound, LogOut, Mail, Shield, User } from "lucide-react";
import { toast } from "sonner";

import { useAuth } from "@/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

import { ChangePasswordDialog } from "./ChangePasswordDialog";

const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  coordinator: "Coordenador(a)",
  professor: "Professor(a)",
};

const ROLE_VARIANT: Record<
  string,
  "default" | "secondary" | "outline"
> = {
  admin: "default",
  coordinator: "secondary",
  professor: "outline",
};

function getInitials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

export default function ProfilePage() {
  const { profile, signOut } = useAuth();
  const navigate = useNavigate();
  const [pwdOpen, setPwdOpen] = useState(false);

  if (!profile) return null;

  const handleSignOut = () => {
    void signOut();
    toast.success("Até logo!");
    navigate("/login", { replace: true });
  };

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div>
        <h1 className="font-display text-3xl font-medium tracking-tight">
          Meu perfil
        </h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Informações da sua conta
        </p>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {profile.avatar_url && (
                <AvatarImage src={profile.avatar_url} alt={profile.full_name} />
              )}
              <AvatarFallback className="text-lg font-medium">
                {getInitials(profile.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex flex-col gap-1.5">
              <CardTitle className="text-xl">{profile.full_name}</CardTitle>
              <CardDescription>@{profile.username}</CardDescription>
              <Badge variant={ROLE_VARIANT[profile.role]}>
                {ROLE_LABEL[profile.role] ?? profile.role}
              </Badge>
            </div>
          </div>
        </CardHeader>

        <Separator />

        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center gap-3 text-sm">
            <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">E-mail</p>
              <p className="font-medium">{profile.email}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <User className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Usuário</p>
              <p className="font-medium">@{profile.username}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 text-sm">
            <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Papel</p>
              <p className="font-medium">
                {ROLE_LABEL[profile.role] ?? profile.role}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setPwdOpen(true)}
        >
          <KeyRound className="h-4 w-4" />
          Alterar senha
        </Button>

        <Button
          variant="outline"
          className="w-full text-destructive hover:text-destructive hover:bg-destructive/5"
          onClick={handleSignOut}
        >
          <LogOut className="h-4 w-4" />
          Sair da conta
        </Button>
      </div>

      <ChangePasswordDialog open={pwdOpen} onOpenChange={setPwdOpen} />
    </div>
  );
}
