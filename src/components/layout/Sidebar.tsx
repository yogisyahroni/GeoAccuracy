import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
    LayoutDashboard,
    History,
    BarChart3,
    Settings,
    Truck,
    LogOut,
    ChevronLeft,
    ChevronRight,
    User,
    Database,
    MapPin,
    TrendingUp,
    FileText,
} from 'lucide-react';
import { useAuthStore } from '@/store/useAuthStore';

interface NavItem {
    to: string;
    icon: React.ElementType;
    label: string;
}

const NAV_ITEMS: NavItem[] = [
    { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
    { to: '/integration', icon: Database, label: 'Integarasi Data' },
    { to: '/areas', icon: MapPin, label: 'Manajemen Area' },
    { to: '/history', icon: FileText, label: 'Riwayat Validasi' },
    { to: '/analytics', icon: BarChart3, label: 'Analitik Topologi' },
    { to: '/advanced-analytics', icon: TrendingUp, label: 'Performa Kurir' },
    { to: '/settings', icon: Settings, label: 'Pengaturan' },
];

export function Sidebar() {
    const [collapsed, setCollapsed] = useState(false);
    const user = useAuthStore(s => s.user);
    const logout = useAuthStore(s => s.logout);
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    return (
        <motion.aside
            animate={{ width: collapsed ? 64 : 220 }}
            transition={{ duration: 0.22, ease: 'easeInOut' }}
            className="relative flex flex-col h-screen shrink-0 border-r overflow-hidden"
            style={{
                background: 'hsl(var(--surface-1))',
                borderColor: 'hsl(var(--border) / 0.5)',
            }}
        >
            {/* ── Logo ─────────────────────────────────────────────────── */}
            <div
                className="flex items-center gap-3 px-4 py-5 border-b"
                style={{ borderColor: 'hsl(var(--border) / 0.4)' }}
            >
                <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: 'hsl(var(--primary) / 0.15)', border: '1px solid hsl(var(--primary) / 0.3)' }}
                >
                    <Truck className="w-4 h-4" style={{ color: 'hsl(var(--primary))' }} />
                </div>
                <AnimatePresence>
                    {!collapsed && (
                        <motion.div
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -8 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                        >
                            <p className="text-sm font-bold leading-none" style={{ color: 'hsl(var(--primary))' }}>
                                GeoAccuracy
                            </p>
                            <p className="text-[10px] mt-0.5" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                Logistics Validator
                            </p>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* ── Nav Items ─────────────────────────────────────────────── */}
            <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
                {NAV_ITEMS.filter(item => {
                    const isObserver = user?.role === 'observer';
                    if (isObserver && (item.label === 'Pengaturan' || item.label === 'Integarasi Data')) {
                        return false;
                    }
                    return true;
                }).map(({ to, icon: Icon, label }) => (
                    <NavLink
                        key={to}
                        to={to}
                        end={to === '/'}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 group ${isActive ? 'nav-active' : 'nav-item'
                            }`
                        }
                    >
                        {({ isActive }) => (
                            <>
                                <Icon
                                    className="w-4 h-4 shrink-0"
                                    style={{ color: isActive ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))' }}
                                />
                                <AnimatePresence>
                                    {!collapsed && (
                                        <motion.span
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                            transition={{ duration: 0.12 }}
                                            style={{ color: isActive ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                                        >
                                            {label}
                                        </motion.span>
                                    )}
                                </AnimatePresence>
                            </>
                        )}
                    </NavLink>
                ))}
            </nav>

            {/* ── User + Logout ─────────────────────────────────────────── */}
            <div
                className="p-2 border-t space-y-0.5"
                style={{ borderColor: 'hsl(var(--border) / 0.4)' }}
            >
                {/* User info */}
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-xl" style={{ background: 'hsl(var(--surface-2) / 0.6)' }}>
                    <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: 'hsl(var(--primary) / 0.2)' }}
                    >
                        <User className="w-3.5 h-3.5" style={{ color: 'hsl(var(--primary))' }} />
                    </div>
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.12 }}
                                className="overflow-hidden"
                            >
                                <p className="text-xs font-medium truncate max-w-[120px]" style={{ color: 'hsl(var(--foreground))' }}>
                                    {user?.name ?? user?.email ?? 'User'}
                                </p>
                                <p className="text-[10px] truncate max-w-[120px]" style={{ color: 'hsl(var(--muted-foreground))' }}>
                                    {user?.email ?? ''}
                                </p>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* Logout */}
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 hover:brightness-110"
                    style={{ color: 'hsl(var(--muted-foreground))', background: 'transparent' }}
                    title="Keluar"
                >
                    <LogOut className="w-4 h-4 shrink-0" />
                    <AnimatePresence>
                        {!collapsed && (
                            <motion.span
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.12 }}
                            >
                                Keluar
                            </motion.span>
                        )}
                    </AnimatePresence>
                </button>
            </div>

            {/* ── Collapse Toggle ───────────────────────────────────────── */}
            <button
                onClick={() => setCollapsed(v => !v)}
                className="absolute top-[68px] -right-3 w-6 h-6 rounded-full border flex items-center justify-center z-10 transition-all hover:brightness-110"
                style={{
                    background: 'hsl(var(--surface-2))',
                    borderColor: 'hsl(var(--border))',
                    color: 'hsl(var(--muted-foreground))',
                }}
                title={collapsed ? 'Perluas sidebar' : 'Ciutkan sidebar'}
            >
                {collapsed ? <ChevronRight className="w-3 h-3" /> : <ChevronLeft className="w-3 h-3" />}
            </button>
        </motion.aside>
    );
}
