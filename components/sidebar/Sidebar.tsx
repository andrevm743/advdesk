"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  LayoutDashboard,
  FileText,
  Search,
  MessageSquare,
  FolderOpen,
  Settings,
  LogOut,
  Scale,
  ChevronLeft,
  ChevronRight,
  Menu,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { signOut } from "@/lib/firebase/auth";
import { useAuthStore } from "@/lib/stores/authStore";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";

const navItems = [
  { href: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/nova-peticao", icon: FileText, label: "Nova Petição" },
  { href: "/analise-peticao", icon: Search, label: "Análise de Petições" },
  { href: "/atendimento", icon: MessageSquare, label: "Atendimento" },
  { href: "/historico", icon: FolderOpen, label: "Histórico" },
];

function SidebarContent({ collapsed, mobile, onClose }: { collapsed: boolean; mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuthStore();

  async function handleLogout() {
    try {
      await signOut();
      router.replace("/login");
    } catch {
      toast.error("Erro ao sair. Tente novamente.");
    }
  }

  return (
    <div className="flex flex-col h-full bg-sidebar text-sidebar-foreground border-r border-sidebar-border">
      {/* Logo */}
      <div className={cn("flex items-center h-16 px-4 border-b border-sidebar-border", collapsed && !mobile ? "justify-center" : "gap-3")}>
        <div className="flex items-center gap-2 text-primary">
          <Scale className="h-6 w-6 shrink-0" />
          {(!collapsed || mobile) && (
            <span className="font-bold text-lg tracking-wider">ADVDESK</span>
          )}
        </div>
        {mobile && (
          <button onClick={onClose} className="ml-auto text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-4 px-2 space-y-1 overflow-y-auto">
        {navItems.map(({ href, icon: Icon, label }) => {
          const isActive = pathname === href || pathname.startsWith(href + "/");
          return (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                collapsed && !mobile && "justify-center px-2"
              )}
              title={collapsed && !mobile ? label : undefined}
            >
              <Icon className="h-5 w-5 shrink-0" />
              {(!collapsed || mobile) && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>

      <Separator className="bg-sidebar-border" />

      {/* Bottom section */}
      <div className="p-2 space-y-1">
        {user?.role === "admin" && (
          <Link
            href="/configuracoes"
            onClick={onClose}
            className={cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
              collapsed && !mobile && "justify-center px-2"
            )}
            title={collapsed && !mobile ? "Configurações" : undefined}
          >
            <Settings className="h-5 w-5 shrink-0" />
            {(!collapsed || mobile) && <span>Configurações</span>}
          </Link>
        )}

        {/* User info */}
        {(!collapsed || mobile) && user && (
          <div className="px-3 py-2">
            <p className="text-xs font-medium text-foreground truncate">{user.displayName}</p>
            <p className="text-xs text-muted-foreground truncate">{user.email}</p>
          </div>
        )}

        <Button
          variant="ghost"
          onClick={handleLogout}
          className={cn(
            "w-full text-muted-foreground hover:text-destructive hover:bg-destructive/10",
            collapsed && !mobile ? "px-2 justify-center" : "justify-start gap-3"
          )}
          title={collapsed && !mobile ? "Sair" : undefined}
        >
          <LogOut className="h-5 w-5 shrink-0" />
          {(!collapsed || mobile) && <span>Sair</span>}
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Mobile hamburger */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-sidebar border border-sidebar-border text-sidebar-foreground"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="fixed inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 h-full">
            <SidebarContent mobile onClose={() => setMobileOpen(false)} collapsed={false} />
          </div>
        </div>
      )}

      {/* Desktop sidebar */}
      <div
        className={cn(
          "hidden lg:flex flex-col relative transition-all duration-300",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent collapsed={collapsed} />
        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="absolute -right-3 top-20 z-10 flex items-center justify-center w-6 h-6 rounded-full bg-sidebar border border-sidebar-border text-muted-foreground hover:text-foreground hover:bg-sidebar-accent transition-colors"
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>
      </div>
    </>
  );
}
