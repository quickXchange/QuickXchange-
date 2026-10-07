import { useI18n as useCustomerI18n } from "@workspace/i18n";
import * as React from 'react';
import { ButtonProps, buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ChevronLeft, ChevronRight, MoreHorizontal } from 'lucide-react';
import { useOptionalI18n } from '@/i18n/provider';

const Pagination = ({ className, ...props }: React.ComponentProps<'nav'>) => {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const i18n = useOptionalI18n();

  return (
    <nav
      role="navigation"
      aria-label={i18n?.t('genericUi.paginationLabel') ?? uiT("customer.mc30ad110383e")}
      className={cn('mx-auto flex w-full justify-center', className)}
      {...props}
    />
  );
};
Pagination.displayName = 'Pagination';

const PaginationContent = React.forwardRef<
  HTMLUListElement,
  React.ComponentProps<'ul'>
>(({ className, ...props }, ref) => (
  <ul
    ref={ref}
    className={cn('flex flex-row items-center gap-1', className)}
    {...props}
  />
));
PaginationContent.displayName = 'PaginationContent';

const PaginationItem = React.forwardRef<
  HTMLLIElement,
  React.ComponentProps<'li'>
>(({ className, ...props }, ref) => (
  <li ref={ref} className={cn('', className)} {...props} />
));
PaginationItem.displayName = 'PaginationItem';

type PaginationLinkProps = {
  isActive?: boolean;
} & Pick<ButtonProps, 'size'> &
  React.ComponentProps<'a'>;

const PaginationLink = ({
  className,
  isActive,
  size = 'icon',
  ...props
}: PaginationLinkProps) => (
  <a
    aria-current={isActive ? 'page' : undefined}
    className={cn(
      buttonVariants({
        variant: isActive ? 'outline' : 'ghost',
        size,
      }),
      className,
    )}
    {...props}
  />
);
PaginationLink.displayName = 'PaginationLink';

const PaginationPrevious = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const i18n = useOptionalI18n();

  return (
    <PaginationLink
      aria-label={i18n?.t('genericUi.goToPreviousPage') ?? uiT("customer.m2865e0f438b4")}
      size="default"
      className={cn('gap-1 pl-2.5', className)}
      {...props}
    >
      <ChevronLeft className="h-4 w-4" />
      <span>{i18n?.t('genericUi.previous') ?? uiT("customer.ma57b08a480b8")}</span>
    </PaginationLink>
  );
};
PaginationPrevious.displayName = 'PaginationPrevious';

const PaginationNext = ({
  className,
  ...props
}: React.ComponentProps<typeof PaginationLink>) => {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const i18n = useOptionalI18n();

  return (
    <PaginationLink
      aria-label={i18n?.t('genericUi.goToNextPage') ?? uiT("customer.m7e021afbf6ac")}
      size="default"
      className={cn('gap-1 pr-2.5', className)}
      {...props}
    >
      <span>{i18n?.t('genericUi.next') ?? uiT("customer.m1ff57a29d7c9")}</span>
      <ChevronRight className="h-4 w-4" />
    </PaginationLink>
  );
};
PaginationNext.displayName = 'PaginationNext';

const PaginationEllipsis = ({
  className,
  ...props
}: React.ComponentProps<'span'>) => {
  const { t: uiT, tx: uiText } = useCustomerI18n();

  const i18n = useOptionalI18n();

  return (
    <span
      aria-hidden
      className={cn('flex h-10 w-10 items-center justify-center', className)}
      {...props}
    >
      <MoreHorizontal className="h-4 w-4" />
      <span className="sr-only">
        {i18n?.t('genericUi.morePages') ?? uiT("customer.m0418cd51e53f")}
      </span>
    </span>
  );
};
PaginationEllipsis.displayName = 'PaginationEllipsis';

export {
  Pagination,
  PaginationContent,
  PaginationLink,
  PaginationItem,
  PaginationPrevious,
  PaginationNext,
  PaginationEllipsis,
};
