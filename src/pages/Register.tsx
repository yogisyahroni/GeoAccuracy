import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Loader2, UserPlus, Truck, Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { authApi, ApiError } from '@/lib/api';
import { useAuthStore } from '@/store/useAuthStore';

// ─── Schema ───────────────────────────────────────────────────────────────────

const registerSchema = z
    .object({
        name: z.string().min(2, 'Nama minimal 2 karakter').max(100, 'Nama terlalu panjang'),
        email: z.string().min(1, 'Email wajib diisi').email('Format email tidak valid'),
        password: z
            .string()
            .min(8, 'Password minimal 8 karakter')
            .regex(/[A-Z]/, 'Harus mengandung huruf kapital')
            .regex(/[0-9]/, 'Harus mengandung angka'),
        confirmPassword: z.string().min(1, 'Konfirmasi password wajib diisi'),
    })
    .refine((data) => data.password === data.confirmPassword, {
        message: 'Password dan konfirmasi tidak cocok',
        path: ['confirmPassword'],
    });

type RegisterForm = z.infer<typeof registerSchema>;

// ─── Shared field styles ───────────────────────────────────────────────────────

const fieldBase =
    'w-full px-4 py-3 rounded-xl text-sm border outline-none transition-all duration-200 placeholder:text-muted-foreground/50';

const fieldStyle = (hasError: boolean) => ({
    background: 'hsl(var(--surface-2, var(--muted)))',
    borderColor: hasError ? 'hsl(var(--destructive))' : 'hsl(var(--border))',
    color: 'hsl(var(--foreground))',
    boxShadow: 'none',
});

const fieldFocus = (hasError: boolean) => ({
    borderColor: hasError ? 'hsl(var(--destructive))' : 'hsl(var(--primary))',
    boxShadow: hasError
        ? '0 0 0 3px hsl(var(--destructive) / 0.12)'
        : '0 0 0 3px hsl(var(--primary) / 0.12)',
});

// ─── Animation variants ────────────────────────────────────────────────────────

const pageVariants = {
    initial: { opacity: 0, y: 24, scale: 0.98 },
    animate: { opacity: 1, y: 0, scale: 1 },
    exit: { opacity: 0, y: -16, scale: 0.98 },
};

const cardVariants = {
    initial: { opacity: 0, y: 32 },
    animate: { opacity: 1, y: 0, transition: { delay: 0.1 } },
};

// ─── Component ────────────────────────────────────────────────────────────────

const Register = () => {
    const navigate = useNavigate();
    const login = useAuthStore((s) => s.login);
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);

    const {
        register,
        handleSubmit,
        formState: { errors, isSubmitting },
    } = useForm<RegisterForm>({
        resolver: zodResolver(registerSchema),
        mode: 'onBlur',
    });

    const onSubmit = async (data: RegisterForm) => {
        try {
            const res = await authApi.register({
                name: data.name,
                email: data.email,
                password: data.password,
            });
            login(res.user, res.access_token);
            toast.success(`Akun berhasil dibuat! Selamat datang, ${res.user.name}! 🎉`);
            navigate('/', { replace: true });
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 409) {
                    toast.error('Email sudah terdaftar. Gunakan email lain atau masuk.');
                } else if (err.status === 0) {
                    toast.error('Tidak dapat terhubung ke server. Pastikan backend berjalan.');
                } else {
                    toast.error(err.message);
                }
            } else {
                toast.error('Terjadi kesalahan tak terduga. Coba lagi.');
            }
        }
    };

    return (
        <motion.div
            key="register"
            variants={pageVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3, ease: 'easeOut' }}
            className="min-h-screen flex items-center justify-center p-6"
            style={{ background: 'hsl(var(--background))' }}
        >
            {/* Ambient glow — top */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    background:
                        'radial-gradient(ellipse 90% 55% at 50% -5%, hsl(var(--primary) / 0.15) 0%, transparent 65%)',
                }}
            />
            {/* Ambient glow — bottom left */}
            <div
                className="fixed inset-0 pointer-events-none"
                style={{
                    background:
                        'radial-gradient(ellipse 50% 40% at 15% 100%, hsl(var(--primary) / 0.06) 0%, transparent 70%)',
                }}
            />

            <div className="w-full max-w-sm relative z-10">
                {/* Logo */}
                <motion.div
                    className="flex flex-col items-center mb-8 gap-3"
                    initial={{ opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                    <div
                        className="p-3.5 rounded-2xl"
                        style={{
                            background: 'hsl(var(--primary) / 0.1)',
                            border: '1px solid hsl(var(--primary) / 0.2)',
                            boxShadow: '0 0 32px hsl(var(--primary) / 0.15)',
                        }}
                    >
                        <Truck className="w-7 h-7" style={{ color: 'hsl(var(--primary))' }} />
                    </div>
                    <div className="text-center">
                        <h1 className="text-2xl font-bold tracking-tight nav-logo-text">
                            GeoAccuracy
                        </h1>
                        <p className="text-xs mt-1" style={{ color: 'hsl(var(--muted-foreground))' }}>
                            Logistics Address Validator
                        </p>
                    </div>
                </motion.div>

                {/* Card */}
                <motion.div
                    variants={cardVariants}
                    initial="initial"
                    animate="animate"
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    className="rounded-2xl border p-8"
                    style={{
                        background: 'hsl(var(--surface-1, var(--card)) / 0.75)',
                        borderColor: 'hsl(var(--border) / 0.5)',
                        backdropFilter: 'blur(20px)',
                        WebkitBackdropFilter: 'blur(20px)',
                        boxShadow:
                            '0 4px 32px hsl(220 27% 4% / 0.5), inset 0 1px 0 hsl(var(--foreground) / 0.05)',
                    }}
                >
                    <h2
                        className="text-lg font-semibold tracking-tight mb-1"
                        style={{ color: 'hsl(var(--foreground))' }}
                    >
                        Buat akun baru
                    </h2>
                    <p className="text-sm mb-6" style={{ color: 'hsl(var(--muted-foreground))' }}>
                        Sudah punya akun?{' '}
                        <Link
                            to="/login"
                            className="font-medium transition-colors hover:brightness-125"
                            style={{ color: 'hsl(var(--primary))' }}
                        >
                            Masuk di sini
                        </Link>
                    </p>

                    <form onSubmit={handleSubmit(onSubmit)} noValidate className="space-y-4">
                        {/* Name */}
                        <div className="space-y-1.5">
                            <label
                                htmlFor="name"
                                className="block text-xs font-medium uppercase tracking-wider"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                                Nama Lengkap
                            </label>
                            <input
                                id="name"
                                type="text"
                                autoComplete="name"
                                placeholder="Nama Anda"
                                {...register('name')}
                                className={fieldBase}
                                style={fieldStyle(!!errors.name)}
                                onFocus={(e) => Object.assign(e.currentTarget.style, fieldFocus(!!errors.name))}
                                onBlur={(e) => Object.assign(e.currentTarget.style, fieldStyle(!!errors.name))}
                            />
                            {errors.name && (
                                <motion.p
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-xs"
                                    style={{ color: 'hsl(var(--destructive))' }}
                                >
                                    {errors.name.message}
                                </motion.p>
                            )}
                        </div>

                        {/* Email */}
                        <div className="space-y-1.5">
                            <label
                                htmlFor="email"
                                className="block text-xs font-medium uppercase tracking-wider"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                                Email
                            </label>
                            <input
                                id="email"
                                type="email"
                                autoComplete="email"
                                placeholder="nama@perusahaan.com"
                                {...register('email')}
                                className={fieldBase}
                                style={fieldStyle(!!errors.email)}
                                onFocus={(e) => Object.assign(e.currentTarget.style, fieldFocus(!!errors.email))}
                                onBlur={(e) => Object.assign(e.currentTarget.style, fieldStyle(!!errors.email))}
                            />
                            {errors.email && (
                                <motion.p
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-xs"
                                    style={{ color: 'hsl(var(--destructive))' }}
                                >
                                    {errors.email.message}
                                </motion.p>
                            )}
                        </div>

                        {/* Password */}
                        <div className="space-y-1.5">
                            <label
                                htmlFor="password"
                                className="block text-xs font-medium uppercase tracking-wider"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                                Password
                            </label>
                            <div className="relative">
                                <input
                                    id="password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Min 8 karakter, huruf kapital + angka"
                                    {...register('password')}
                                    className={`${fieldBase} pr-11`}
                                    style={fieldStyle(!!errors.password)}
                                    onFocus={(e) => Object.assign(e.currentTarget.style, fieldFocus(!!errors.password))}
                                    onBlur={(e) => Object.assign(e.currentTarget.style, fieldStyle(!!errors.password))}
                                />
                                <button
                                    type="button"
                                    aria-label={showPassword ? 'Sembunyikan password' : 'Tampilkan password'}
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-all duration-150 hover:opacity-80"
                                    style={{ color: 'hsl(var(--muted-foreground))' }}
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {errors.password && (
                                <motion.p
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-xs"
                                    style={{ color: 'hsl(var(--destructive))' }}
                                >
                                    {errors.password.message}
                                </motion.p>
                            )}
                        </div>

                        {/* Confirm Password */}
                        <div className="space-y-1.5">
                            <label
                                htmlFor="confirmPassword"
                                className="block text-xs font-medium uppercase tracking-wider"
                                style={{ color: 'hsl(var(--muted-foreground))' }}
                            >
                                Konfirmasi Password
                            </label>
                            <div className="relative">
                                <input
                                    id="confirmPassword"
                                    type={showConfirm ? 'text' : 'password'}
                                    autoComplete="new-password"
                                    placeholder="Ulangi password"
                                    {...register('confirmPassword')}
                                    className={`${fieldBase} pr-11`}
                                    style={fieldStyle(!!errors.confirmPassword)}
                                    onFocus={(e) => Object.assign(e.currentTarget.style, fieldFocus(!!errors.confirmPassword))}
                                    onBlur={(e) => Object.assign(e.currentTarget.style, fieldStyle(!!errors.confirmPassword))}
                                />
                                <button
                                    type="button"
                                    aria-label={showConfirm ? 'Sembunyikan' : 'Tampilkan'}
                                    onClick={() => setShowConfirm((v) => !v)}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 p-0.5 rounded-md transition-all duration-150 hover:opacity-80"
                                    style={{ color: 'hsl(var(--muted-foreground))' }}
                                >
                                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                            {errors.confirmPassword && (
                                <motion.p
                                    initial={{ opacity: 0, y: -4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    className="text-xs"
                                    style={{ color: 'hsl(var(--destructive))' }}
                                >
                                    {errors.confirmPassword.message}
                                </motion.p>
                            )}
                        </div>

                        {/* Submit */}
                        <motion.button
                            type="submit"
                            disabled={isSubmitting}
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed mt-2"
                            style={{
                                background: 'hsl(var(--primary))',
                                color: 'hsl(var(--primary-foreground))',
                                boxShadow: '0 0 28px hsl(var(--primary) / 0.35)',
                            }}
                        >
                            {isSubmitting ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                                <UserPlus className="w-4 h-4" />
                            )}
                            {isSubmitting ? 'Membuat Akun...' : 'Buat Akun'}
                        </motion.button>
                    </form>
                </motion.div>

                {/* Disclaimer */}
                <p className="text-center text-xs mt-5" style={{ color: 'hsl(var(--muted-foreground) / 0.6)' }}>
                    Dengan mendaftar, Anda menyetujui kebijakan penggunaan aplikasi ini.
                </p>
            </div>
        </motion.div>
    );
};

export default Register;
