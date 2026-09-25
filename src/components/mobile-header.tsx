import { MobileSidebar } from "./mobile-sidebar";
import { Sidebar } from "./sidebar";

// Серверный <Sidebar> рендерится здесь и передаётся в клиентский drawer
// как children — допустимо в RSC (server → client через children).
export const MobileHeader = () => {
  return (
    <nav className="fixed top-0 z-50 flex h-[50px] w-full items-center border-b bg-green-500 px-4 lg:hidden">
      <MobileSidebar>
        <Sidebar />
      </MobileSidebar>
    </nav>
  );
};
