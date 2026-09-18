import {
  memo,
  useEffect,
  useRef,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { ArrowRight, Landmark, Zap } from 'lucide-react';
import {
  getGetPopularExchangePairsQueryKey,
  useGetPopularExchangePairs,
} from '@workspace/api-client-react';
import type { PopularExchangePair } from '@workspace/api-client-react';
import {
  requestMarketConvertSelection,
  requestMarketSwapSelection,
} from '@/lib/market-convert-selection';
import { CryptoLogo } from '@/components/crypto-identity';
import { PaymentMethodLogo } from '@/components/exchange-surface';

function PairIdentity({
  side,
  back,
  mode,
}: {
  side: PopularExchangePair['source'];
  back?: boolean;
  mode: PopularExchangePair['mode'];
}) {
  const classes = `ring-[3px] ring-card ${back ? 'z-0' : 'z-10'} relative shadow-sm`;
  if (side.kind === 'fiat-payment-method') {
    return mode === 'swap' ? (
      <PaymentMethodLogo
        name={side.label || side.asset}
        logoUrl={side.logoUrl}
        priority={false}
        preferBrandIcon
        className={`${classes} popular-swap-pair-payment-logo`}
      />
    ) : side.logoUrl ? (
      <span className={`${classes} flex h-10 w-10 items-center justify-center overflow-hidden rounded-full bg-white`}>
        <img src={side.logoUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-contain p-1.5" />
      </span>
    ) : (
      <span className={`${classes} flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary`}>
        <Landmark size={18} aria-hidden="true" />
      </span>
    );
  }
  return (
    <CryptoLogo
      symbol={side.asset}
      logoUrl={side.logoUrl}
      size={mode === 'swap' ? 'lg' : 'md'}
      preferSymbolLogo={!side.logoUrl}
      className={`${classes} ${mode === 'swap' ? 'popular-swap-pair-crypto-logo' : ''}`}
    />
  );
}

function PopularPairCard({ pair, duplicate }: {
  pair: PopularExchangePair;
  duplicate?: boolean;
}) {
  const sourceLabel = pair.source.label || pair.source.asset;
  const targetLabel = pair.target.label || pair.target.asset;
  const handleClick = () => {
    if (pair.mode === 'convert') {
      requestMarketConvertSelection({
        symbol: pair.source.asset,
        sourceNetwork: pair.source.network,
        destinationSymbol: pair.target.asset,
        destinationNetwork: pair.target.network,
      });
      return;
    }
    requestMarketSwapSelection({
      sourceSettlementOptionId: pair.source.settlementOptionId,
      targetSettlementOptionId: pair.target.settlementOptionId,
    });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      tabIndex={duplicate ? -1 : undefined}
      aria-hidden={duplicate || undefined}
      aria-label={`${pair.mode === 'convert' ? 'Convert' : 'Swap'} ${sourceLabel} to ${targetLabel}`}
      className="popular-pair-marquee-card group relative shrink-0 overflow-hidden rounded-[20px] border border-[#258cff]/30 bg-card p-5 text-left shadow-[inset_0_0_24px_rgba(19,221,244,0.10),inset_0_0_42px_rgba(122,44,255,0.06),0_0_0_1px_rgba(37,140,255,0.04)] transition-[border-color,box-shadow] duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:border-[#13ddf4]/55 hover:shadow-[inset_0_0_34px_rgba(19,221,244,0.18),inset_0_0_56px_rgba(122,44,255,0.12),0_8px_28px_rgba(37,140,255,0.14)] active:border-[#13ddf4]/60 dark:border-[#438cff]/35 dark:bg-[#0b1424] dark:shadow-[inset_0_0_30px_rgba(19,221,244,0.12),inset_0_0_52px_rgba(122,44,255,0.12),0_0_0_1px_rgba(67,140,255,0.06)] dark:hover:border-[#13ddf4]/60 dark:hover:shadow-[inset_0_0_40px_rgba(19,221,244,0.22),inset_0_0_68px_rgba(122,44,255,0.20),0_10px_30px_rgba(20,90,210,0.18)] md:p-6"
      data-testid={duplicate ? undefined : `popular-${pair.mode}-pair-${pair.source.settlementOptionId}-${pair.target.settlementOptionId}`}
    >
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_0%_0%,rgba(19,221,244,0.16),transparent_42%),radial-gradient(circle_at_100%_100%,rgba(122,44,255,0.13),transparent_44%)] opacity-70 transition-opacity duration-500 group-hover:opacity-100 dark:opacity-90" />
      <span className="relative z-10 mb-5 flex items-center justify-between">
        <span className="flex min-w-0 items-center gap-3.5">
          <span className="flex items-center -space-x-2.5">
            <PairIdentity side={pair.source} mode={pair.mode} />
            <PairIdentity side={pair.target} mode={pair.mode} back />
          </span>
          <span className="flex min-w-0 flex-col">
            <strong className="truncate text-lg font-bold leading-tight tracking-tight text-foreground">
              {sourceLabel}/{targetLabel}
            </strong>
            <span className="mt-1 truncate text-xs font-medium text-muted-foreground">
              {pair.source.network}{pair.target.kind === 'crypto-network' ? ` → ${pair.target.network}` : ''}
            </span>
          </span>
        </span>
      </span>
      <span className="relative z-10 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl border border-[#258cff]/25 bg-[#158cff]/10 py-2.5 font-bold text-primary shadow-[inset_0_0_18px_rgba(19,221,244,0.14),inset_0_0_28px_rgba(122,44,255,0.08)] transition-all duration-300 group-hover:border-[#13ddf4]/45 group-hover:bg-[#158cff]/15 group-hover:shadow-[inset_0_0_24px_rgba(19,221,244,0.22),inset_0_0_38px_rgba(122,44,255,0.16)] dark:bg-[#087bff]/12">
        <span className="pointer-events-none absolute inset-0 bg-gradient-to-r from-[#13ddf4]/10 via-[#258cff]/8 to-[#7a2cff]/10 opacity-80 transition-opacity group-hover:opacity-100" />
        <Zap size={16} className="relative z-10" />
        <span className="relative z-10">{pair.mode === 'convert' ? 'Convert' : 'Swap'}</span>
      </span>
    </button>
  );
}

function PairRow({
  title,
  pairs,
  direction,
  loading,
}: {
  title: string;
  pairs: PopularExchangePair[];
  direction: 'left' | 'right';
  loading: boolean;
}) {
  const marqueeRef = useRef<HTMLDivElement>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const clearClickSuppressionTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startTime: number;
    sequenceWidth: number;
    duration: number;
    horizontal: boolean;
  } | null>(null);
  const skeletons = Array.from({ length: 6 }, (_, index) => index);
  const getAnimationState = () => {
    const track = marqueeRef.current?.querySelector<HTMLElement>('.popular-pairs-track');
    const sequence = track?.querySelector<HTMLElement>('.popular-pairs-sequence');
    const animation = track?.getAnimations()[0];
    const duration = Number(animation?.effect?.getTiming().duration);
    const sequenceWidth = sequence?.getBoundingClientRect().width ?? 0;
    if (
      !animation ||
      typeof animation.currentTime !== 'number' ||
      !Number.isFinite(duration) ||
      duration <= 0 ||
      sequenceWidth <= 0
    ) return null;
    return { animation, duration, sequenceWidth };
  };
  const normalizedTime = (time: number, duration: number) =>
    ((time % duration) + duration) % duration;
  const clearResumeTimer = () => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  };
  const scheduleResume = () => {
    clearResumeTimer();
    resumeTimerRef.current = window.setTimeout(() => {
      getAnimationState()?.animation.play();
      resumeTimerRef.current = null;
    }, 2500);
  };

  useEffect(() => {
    const marquee = marqueeRef.current;
    const handleWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaX) < 1 || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const state = getAnimationState();
      if (!state) return;
      event.preventDefault();
      clearResumeTimer();
      state.animation.pause();
      const directionMultiplier = direction === 'left' ? 1 : -1;
      state.animation.currentTime = normalizedTime(
        (state.animation.currentTime as number) +
          directionMultiplier * (event.deltaX / state.sequenceWidth) * state.duration,
        state.duration,
      );
      scheduleResume();
    };
    marquee?.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      marquee?.removeEventListener('wheel', handleWheel);
      clearResumeTimer();
      if (clearClickSuppressionTimerRef.current !== null) {
        window.clearTimeout(clearClickSuppressionTimerRef.current);
      }
    };
  }, [direction]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const state = getAnimationState();
    if (!state) return;
    clearResumeTimer();
    state.animation.pause();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startTime: state.animation.currentTime as number,
      sequenceWidth: state.sequenceWidth,
      duration: state.duration,
      horizontal: false,
    };
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (!drag.horizontal) {
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        scheduleResume();
        return;
      }
      if (Math.abs(deltaX) < 8 || Math.abs(deltaX) <= Math.abs(deltaY)) return;
      drag.horizontal = true;
      suppressClickRef.current = true;
      event.currentTarget.dataset.dragging = 'true';
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    if (event.cancelable) event.preventDefault();
    const state = getAnimationState();
    if (!state) return;
    const directionMultiplier = direction === 'left' ? -1 : 1;
    state.animation.currentTime = normalizedTime(
      drag.startTime + directionMultiplier * (deltaX / drag.sequenceWidth) * drag.duration,
      drag.duration,
    );
  };

  const handlePointerEnd = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    dragRef.current = null;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    scheduleResume();
    if (clearClickSuppressionTimerRef.current !== null) {
      window.clearTimeout(clearClickSuppressionTimerRef.current);
    }
    clearClickSuppressionTimerRef.current = window.setTimeout(() => {
      suppressClickRef.current = false;
      clearClickSuppressionTimerRef.current = null;
    }, 400);
  };

  const renderSequence = (duplicate = false) => (
    <div className="popular-pairs-sequence" aria-hidden={duplicate || undefined}>
      {loading
        ? skeletons.map(index => (
          <div key={index} className="popular-pair-marquee-card shrink-0 rounded-[20px] border border-border/60 bg-card p-5 md:p-6">
            <div className="mb-5 flex items-center gap-3.5">
              <div className="h-10 w-16 rounded-full skeleton" />
              <div className="h-5 w-28 rounded skeleton" />
            </div>
            <div className="h-10 w-full rounded-xl skeleton" />
          </div>
        ))
        : pairs.map(pair => (
          <PopularPairCard
            key={`${pair.source.settlementOptionId}-${pair.target.settlementOptionId}`}
            pair={pair}
            duplicate={duplicate}
          />
        ))}
    </div>
  );

  return (
    <div className="popular-pairs-row">
      <h3 className="mb-4 px-4 text-xl font-extrabold tracking-tight text-foreground md:px-8 md:text-2xl">{title}</h3>
      <div
        ref={marqueeRef}
        className="popular-pairs-marquee"
        data-direction={direction}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onLostPointerCapture={handlePointerEnd}
        onClickCapture={event => {
          if (!suppressClickRef.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClickRef.current = false;
        }}
        onDragStart={event => event.preventDefault()}
      >
        <div className="popular-pairs-track">
          {renderSequence()}
          {renderSequence(true)}
        </div>
      </div>
    </div>
  );
}

export const PopularExchangePairs = memo(function PopularExchangePairs() {
  const popularPairs = useGetPopularExchangePairs({
    query: {
      queryKey: getGetPopularExchangePairsQueryKey(),
      staleTime: 5 * 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: false,
      retry: 2,
    },
  });
  const loading = !popularPairs.data && !popularPairs.isError;
  const convert = popularPairs.data?.convert ?? [];
  const swap = popularPairs.data?.swap ?? [];

  return (
    <section id="popular-pairs" className="relative z-10 w-full py-12" data-testid="popular-pairs-section">
      <div className="mx-auto mb-10 flex max-w-[1440px] flex-col items-center px-4 text-center md:px-8">
        <h2 className="mb-2 text-3xl font-extrabold tracking-tight text-foreground md:text-4xl">
          Popular Exchange Pairs
        </h2>
        <p className="max-w-2xl text-lg font-medium text-muted-foreground">
          Choose a popular active route and continue directly in the QuickXchange widget.
        </p>
      </div>

      <div className="space-y-8">
        <PairRow title="Popular Convert Pairs" pairs={convert} direction="left" loading={loading} />
        <PairRow title="Popular Swap Pairs" pairs={swap} direction="right" loading={loading} />
      </div>

      <div className="relative z-10 mt-8 text-center">
        <button
          type="button"
          onClick={() => requestMarketConvertSelection({ openSelector: 'source' })}
          className="group inline-flex items-center justify-center gap-2 text-sm font-bold text-muted-foreground transition-colors duration-200 hover:text-primary"
          data-testid="btn-view-all-pairs"
        >
          View all pairs
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </button>
      </div>
    </section>
  );
});