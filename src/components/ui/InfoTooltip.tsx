import React from 'react';
import { HelpCircle } from 'lucide-react';
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from '@/components/ui/tooltip';

interface InfoTooltipProps {
    /** Teks penjelasan dalam Bahasa Indonesia */
    info: string;
    /** Contoh nilai / kode (opsional) */
    example?: string;
    side?: 'top' | 'right' | 'bottom' | 'left';
}

/**
 * InfoTooltip — ikon tanda tanya kecil (?) yang menampilkan penjelasan
 * fitur dalam Bahasa Indonesia saat di-hover. Gunakan di sebelah label.
 *
 * Contoh pemakaian:
 *   <label>Pipeline Name <InfoTooltip info="Nama unik untuk pipeline ini." example="Contoh: Sync Harian Orders" /></label>
 */
export function InfoTooltip({ info, example, side = 'top' }: InfoTooltipProps) {
    return (
        <TooltipProvider delayDuration={200}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <span className="inline-flex items-center ml-1.5 cursor-help text-muted-foreground hover:text-primary transition-colors focus:outline-none" tabIndex={0}>
                        <HelpCircle className="w-3.5 h-3.5" />
                    </span>
                </TooltipTrigger>
                <TooltipContent side={side} className="max-w-xs text-left p-3 space-y-1">
                    <p className="text-xs leading-snug">{info}</p>
                    {example && (
                        <p className="font-mono text-[10px] bg-muted/70 text-primary rounded px-2 py-1 mt-1">
                            {example}
                        </p>
                    )}
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    );
}

export default InfoTooltip;
