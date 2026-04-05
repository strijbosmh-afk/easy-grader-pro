import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { UserMenu } from "@/components/UserMenu";
import { NotificationBell } from "@/components/NotificationBell";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export function AppLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header
            className="flex items-center justify-between border-b bg-card px-3 shrink-0"
            style={{
              paddingTop: 'env(safe-area-inset-top, 0px)',
              minHeight: 'calc(48px + env(safe-area-inset-top, 0px))',
            }}
          >
            <div className="flex items-center gap-2">
              <SidebarTrigger className="md:hidden h-10 w-10" />
              {/* App name visible on mobile when sidebar is closed */}
              <span className="md:hidden text-sm font-semibold text-foreground">GradeAssist</span>
            </div>
            <div className="ml-auto flex items-center gap-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-10 w-10" onClick={() => navigate("/handleiding")}>
                    <BookOpen className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Handleiding</TooltipContent>
              </Tooltip>
              <NotificationBell />
              <UserMenu />
            </div>
          </header>
          <main className="flex-1 overflow-x-hidden">{children}</main>
        </div>
      </div>
    </SidebarProvider>
  );
}
