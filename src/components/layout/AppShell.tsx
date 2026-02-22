import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Sidebar } from './Sidebar';

// Breadcrumb labels by route
const PAGE_TITLES: Record<string, string> = {
    '/': 'Dashboard',
    '/history': 'Riwayat Validasi',
    '/analytics': 'Analitik Topologi',
    '/advanced-analytics': 'Performa Kurir (SLA)',
    '/settings': 'Pengaturan',
};

const pageVariants = {
    initial: { opacity: 0, y: 6 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -6 },
};

export function AppShell() {
    const location = useLocation();
    const title = PAGE_TITLES[location.pathname] ?? 'GeoAccuracy';

    return (
        <div
            className="flex h-screen overflow-hidden"
            style={{ background: 'hsl(var(--background))' }}
        >
            {/* Sidebar */}
            <Sidebar />

            {/* Main area */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
                {/* Top Header */}
                <header
                    className="shrink-0 flex items-center px-6 h-14 border-b"
                    style={{
                        background: 'hsl(var(--surface-1) / 0.8)',
                        borderColor: 'hsl(var(--border) / 0.5)',
                        backdropFilter: 'blur(12px)',
                        WebkitBackdropFilter: 'blur(12px)',
                    }}
                >
                    <h1
                        className="text-sm font-semibold"
                        style={{ color: 'hsl(var(--foreground))' }}
                    >
                        {title}
                    </h1>
                </header>

                {/* Animated page content */}
                <main className="flex-1 overflow-y-auto">
                    <AnimatePresence mode="wait" initial={false}>
                        <motion.div
                            key={location.pathname}
                            variants={pageVariants}
                            initial="initial"
                            animate="animate"
                            exit="exit"
                            transition={{ duration: 0.2, ease: 'easeOut' }}
                            className="h-full"
                        >
                            <Outlet />
                        </motion.div>
                    </AnimatePresence>
                </main>
            </div>
        </div>
    );
}
