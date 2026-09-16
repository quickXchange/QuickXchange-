import { useState, useEffect } from 'react';
import { Pencil, X, Save, RefreshCw } from 'lucide-react';
import type { Order, OrderSupportToolsInput, Operator } from '@workspace/api-client-react';
import { 
  useUpdateOrderSupportTools,
  OrderSupportToolsInputSupportStatus,
  OrderSupportToolsInputSendingStatus,
  OrderSupportToolsInputReceivingStatus,
  PermissionKey
} from '@workspace/api-client-react';
import { cn } from '@/components/shared-app-ui';
import { apiErrorText } from '@/App';
import { useAdminPermissions } from '@/lib/admin-permissions';

export type NoticeState = { kind: 'success' | 'error' | 'warning'; text: string };

export function OrderSupportToolsSection({
  order,
  activeOperators,
  refresh,
  onNotice,
  onDirtyChange
}: {
  order: Order;
  activeOperators: Operator[];
  refresh: () => Promise<void>;
  onNotice: (notice: NoticeState) => void;
  onDirtyChange?: (isDirty: boolean) => void;
}) {
  const { can } = useAdminPermissions();
  const updateSupportTools = useUpdateOrderSupportTools();
  const [editingFields, setEditingFields] = useState(0);
  
  const [formData, setFormData] = useState<OrderSupportToolsInput>({
    recordVersion: order.recordVersion,
    supportStatus: (order.supportStatus as OrderSupportToolsInputSupportStatus) || OrderSupportToolsInputSupportStatus.open,
    sendingStatus: (order.sendingStatus as OrderSupportToolsInputSendingStatus) || OrderSupportToolsInputSendingStatus.pending,
    receivingStatus: (order.receivingStatus as OrderSupportToolsInputReceivingStatus) || OrderSupportToolsInputReceivingStatus.pending,
    assignedOperatorId: order.assignedOperatorId || null,
    sentAmountOverride: order.sentAmountOverride || null,
    receiveAmountOverride: order.receiveAmountOverride || null,
    exchangeRateOverride: order.exchangeRateOverride || null,
    networkFeeAmount: order.networkFeeAmount || null,
    transactionHash: order.transactionHash || null,
    paymentReference: order.paymentReference || null,
    note: order.note || '',
  });

  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    setFormData({
      recordVersion: order.recordVersion,
      supportStatus: (order.supportStatus as OrderSupportToolsInputSupportStatus) || OrderSupportToolsInputSupportStatus.open,
      sendingStatus: (order.sendingStatus as OrderSupportToolsInputSendingStatus) || OrderSupportToolsInputSendingStatus.pending,
      receivingStatus: (order.receivingStatus as OrderSupportToolsInputReceivingStatus) || OrderSupportToolsInputReceivingStatus.pending,
      assignedOperatorId: order.assignedOperatorId || null,
      sentAmountOverride: order.sentAmountOverride || null,
      receiveAmountOverride: order.receiveAmountOverride || null,
      exchangeRateOverride: order.exchangeRateOverride || null,
      networkFeeAmount: order.networkFeeAmount || null,
      transactionHash: order.transactionHash || null,
      paymentReference: order.paymentReference || null,
      note: order.note || '',
    });
    if (isDirty) onDirtyChange?.(false);
    setIsDirty(false);
    setEditingFields(0);
  }, [order.recordVersion, order.supportStatus, order.sendingStatus, order.receivingStatus, order.assignedOperatorId, order.sentAmountOverride, order.receiveAmountOverride, order.exchangeRateOverride, order.networkFeeAmount, order.transactionHash, order.paymentReference, order.note]);

  const handleChange = (key: keyof OrderSupportToolsInput, value: string | null | number) => {
    setFormData(prev => ({ ...prev, [key]: value }));
    if (!isDirty) {
      setIsDirty(true);
      onDirtyChange?.(true);
    }
  };

  const handleSave = () => {
    if (editingFields > 0) return; // Disallow save if there are pending inline edits
    updateSupportTools.mutate({ id: order.id, data: formData }, {
      onSuccess: async () => {
        onNotice({ kind: 'success', text: 'Support tools updated successfully.' });
        await refresh();
        if (isDirty) onDirtyChange?.(false);
        setIsDirty(false);
      },
      onError: (error: unknown) => {
        if (error && typeof error === "object" && "status" in error && (error as { status: number }).status === 409) {
          onNotice({ kind: 'warning', text: 'Stale version detected. The order was modified elsewhere. Reloading data...' });
          refresh();
        } else {
          onNotice({ kind: 'error', text: apiErrorText(error, 'Failed to update support tools.') });
        }
      }
    });
  };

  return (
    <div className="quickx-order-card min-w-0 border p-4 sm:p-5 rounded-xl shadow-sm space-y-6" data-testid="section-order-support-tools">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h4 className="text-sm font-bold tracking-tight text-foreground flex items-center gap-2">
          Order Support Tools
          {isDirty && <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" title="Unsaved changes" />}
        </h4>
        <div className="flex w-full sm:w-auto items-center gap-2">
        <button 
          type="button" 
          onClick={handleSave} 
          disabled={!isDirty || updateSupportTools.isPending || editingFields > 0} 
          className="flex min-w-0 flex-1 sm:flex-none items-center justify-center gap-1.5 h-8 px-3 sm:px-4 rounded-md bg-primary text-primary-foreground text-xs font-bold shadow-sm hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          data-testid="button-save-support-tools"
        >
          {updateSupportTools.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />}
          {updateSupportTools.isPending ? 'Saving...' : 'Save Changes'}
        </button>
        {isDirty && (
          <button 
            type="button" 
            onClick={() => {
              setFormData({
                recordVersion: order.recordVersion,
                supportStatus: (order.supportStatus as OrderSupportToolsInputSupportStatus) || OrderSupportToolsInputSupportStatus.open,
                sendingStatus: (order.sendingStatus as OrderSupportToolsInputSendingStatus) || OrderSupportToolsInputSendingStatus.pending,
                receivingStatus: (order.receivingStatus as OrderSupportToolsInputReceivingStatus) || OrderSupportToolsInputReceivingStatus.pending,
                assignedOperatorId: order.assignedOperatorId || null,
                sentAmountOverride: order.sentAmountOverride || null,
                receiveAmountOverride: order.receiveAmountOverride || null,
                exchangeRateOverride: order.exchangeRateOverride || null,
                networkFeeAmount: order.networkFeeAmount || null,
                transactionHash: order.transactionHash || null,
                paymentReference: order.paymentReference || null,
                note: order.note || '',
              });
              if (isDirty) onDirtyChange?.(false);
              setIsDirty(false);
              setEditingFields(0);
            }} 
            disabled={updateSupportTools.isPending} 
            className="flex min-w-0 flex-1 sm:flex-none items-center justify-center gap-1.5 h-8 px-3 sm:px-4 rounded-md bg-muted text-muted-foreground hover:bg-muted/80 text-xs font-bold shadow-sm transition-all"
            data-testid="button-reset-support-tools"
          >
            Reset Changes
          </button>
        )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="quickx-field-label text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Order Status</label>
          <select 
            value={formData.supportStatus} 
            onChange={e => handleChange('supportStatus', e.target.value)} 
            className="w-full h-9 px-3 text-sm bg-input border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary"
            data-testid="select-support-status"
          >
            <option value={OrderSupportToolsInputSupportStatus.open}>Open</option>
            <option value={OrderSupportToolsInputSupportStatus.in_progress}>In Progress</option>
            <option value={OrderSupportToolsInputSupportStatus.done}>Done</option>
            <option value={OrderSupportToolsInputSupportStatus.cancelled}>Cancelled</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="quickx-field-label text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Assigned Operator</label>
          {can(PermissionKey.ordersassign) ? (
            <select 
              value={formData.assignedOperatorId || ''} 
              onChange={e => handleChange('assignedOperatorId', e.target.value || null)} 
              className="w-full h-9 px-3 text-sm bg-input border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary"
              data-testid="select-assigned-operator"
            >
              <option value="">Unassigned</option>
              {activeOperators.map(op => (
                <option key={op.id} value={op.id}>{op.email}</option>
              ))}
            </select>
          ) : (
            <div className="w-full h-9 px-3 flex items-center text-sm bg-muted/50 border border-border rounded-md text-muted-foreground" data-testid="text-assigned-operator-readonly">
              {activeOperators.find(op => op.id === formData.assignedOperatorId)?.email || 'Unassigned'}
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="quickx-field-label text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Sending Status</label>
          <select 
            value={formData.sendingStatus} 
            onChange={e => handleChange('sendingStatus', e.target.value)} 
            className="w-full h-9 px-3 text-sm bg-input border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary"
            data-testid="select-sending-status"
          >
            <option value={OrderSupportToolsInputSendingStatus.pending}>Pending</option>
            <option value={OrderSupportToolsInputSendingStatus.sent}>Sent</option>
            <option value={OrderSupportToolsInputSendingStatus.failed}>Failed</option>
            <option value={OrderSupportToolsInputSendingStatus.confirmed}>Confirmed</option>
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="quickx-field-label text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Receiving Status</label>
          <select 
            value={formData.receivingStatus} 
            onChange={e => handleChange('receivingStatus', e.target.value)} 
            className="w-full h-9 px-3 text-sm bg-input border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary"
            data-testid="select-receiving-status"
          >
            <option value={OrderSupportToolsInputReceivingStatus.pending}>Pending</option>
            <option value={OrderSupportToolsInputReceivingStatus.sent}>Sent</option>
            <option value={OrderSupportToolsInputReceivingStatus.failed}>Failed</option>
            <option value={OrderSupportToolsInputReceivingStatus.confirmed}>Confirmed</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/50">
        <OverrideField 
          label="Sent Amount" 
          testId="sent-amount"
          originalValue={order.amount} 
          overrideValue={formData.sentAmountOverride} 
          onChange={val => handleChange('sentAmountOverride', val)} 
          currencyLabel={order.fromAsset}
          type="number"
          onEditStateChange={isEditing => setEditingFields(prev => prev + (isEditing ? 1 : -1))}
          allowNegative={false}
        />
        <OverrideField 
          label="Receive Amount" 
          testId="receive-amount"
          originalValue={order.receiveAmount} 
          overrideValue={formData.receiveAmountOverride} 
          onChange={val => handleChange('receiveAmountOverride', val)} 
          currencyLabel={order.toAsset}
          type="number"
          onEditStateChange={isEditing => setEditingFields(prev => prev + (isEditing ? 1 : -1))}
          allowNegative={false}
        />
        <OverrideField 
          label="Exchange Rate" 
          testId="exchange-rate"
          originalValue={order.finalRate ? String(order.finalRate) : null} 
          overrideValue={formData.exchangeRateOverride} 
          onChange={val => handleChange('exchangeRateOverride', val)} 
          type="number"
          onEditStateChange={isEditing => setEditingFields(prev => prev + (isEditing ? 1 : -1))}
          allowNegative={false}
        />
        <OverrideField 
          label="Network Fee" 
          testId="network-fee"
          originalValue={null} 
          overrideValue={formData.networkFeeAmount} 
          onChange={val => handleChange('networkFeeAmount', val)} 
          currencyLabel={order.fromAsset}
          type="number"
          onEditStateChange={isEditing => setEditingFields(prev => prev + (isEditing ? 1 : -1))}
          allowNegative={false}
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-border/50">
        <OverrideField 
          label="Transaction Hash" 
          testId="transaction-hash"
          originalValue={null} 
          overrideValue={formData.transactionHash} 
          onChange={val => handleChange('transactionHash', val)} 
          onEditStateChange={isEditing => setEditingFields(prev => prev + (isEditing ? 1 : -1))}
        />
        <OverrideField 
          label="Payment Reference" 
          testId="payment-reference"
          originalValue={null} 
          overrideValue={formData.paymentReference} 
          onChange={val => handleChange('paymentReference', val)} 
          onEditStateChange={isEditing => setEditingFields(prev => prev + (isEditing ? 1 : -1))}
        />
      </div>

      <div className="space-y-1.5 pt-4 border-t border-border/50">
        <label className="quickx-field-label text-[11px] uppercase tracking-wider text-muted-foreground font-bold">Internal Order Note</label>
        {can(PermissionKey.ordersnotes) ? (
          <textarea 
            value={formData.note} 
            onChange={e => handleChange('note', e.target.value)} 
            className="w-full min-h-[80px] p-3 text-sm bg-input border border-border rounded-md focus:border-primary focus:ring-1 focus:ring-primary resize-y"
            placeholder="Add operational notes here..."
            data-testid="textarea-internal-note"
          />
        ) : (
          <div className="w-full min-h-[80px] p-3 text-sm bg-muted/50 border border-border rounded-md text-muted-foreground whitespace-pre-wrap" data-testid="text-internal-note-readonly">
            {formData.note || 'No operational notes.'}
          </div>
        )}
      </div>
    </div>
  );
}

function OverrideField({ 
  label, 
  originalValue, 
  overrideValue, 
  onChange, 
  currencyLabel, 
  type = 'text',
  testId,
  onEditStateChange,
  allowNegative = true
}: { 
  label: string; 
  originalValue: string | null; 
  overrideValue: string | null; 
  onChange: (val: string | null) => void;
  currencyLabel?: string;
  type?: 'text' | 'number';
  testId: string;
  onEditStateChange: (isEditing: boolean) => void;
  allowNegative?: boolean;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [tempValue, setTempValue] = useState(overrideValue || originalValue || '');
  const isHashOrRef = testId === "transaction-hash" || testId === "payment-reference";

  useEffect(() => {
    setTempValue(overrideValue || originalValue || '');
  }, [overrideValue, originalValue]);

  const enableEdit = () => {
    if (isEditing) return;
    setIsEditing(true);
    onEditStateChange(true);
  };

  const disableEdit = () => {
    if (!isEditing) return;
    setIsEditing(false);
    onEditStateChange(false);
  };

  const handleApply = () => {
    let val = tempValue.trim();
    if (type === 'number') {
      if (!val) {
        val = '';
      } else {
        if (!allowNegative && val.startsWith('-')) {
          val = val.substring(1);
        }
      }
    }
    
    if (val === '' || val === originalValue) {
      onChange(null);
      disableEdit();
    } else {
      onChange(val);
      disableEdit();
    }
  };

  const handleCancel = () => {
    disableEdit();
    setTempValue(overrideValue || originalValue || '');
  };

  const handleReset = () => {
    onChange(null);
    disableEdit();
    setTempValue(originalValue || '');
  };

  return (
    <div className="flex flex-col gap-1.5" data-testid={`field-container-${testId}`}>
      <label htmlFor={`input-${testId}`} className="quickx-field-label text-[11px] uppercase tracking-wider text-muted-foreground font-bold">{label}</label>
      {isEditing ? (
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-0">
            <input 
              type={type === "number" ? "text" : "text"} 
              className={cn(
                "w-full h-8 px-2.5 text-sm bg-input border rounded-md focus:outline-none focus:ring-1 focus:ring-primary",
                overrideValue !== null ? "border-amber-500/50 bg-amber-500/5 focus:border-amber-500" : "border-border focus:border-primary",
                currencyLabel && "pr-12"
              )}
              value={tempValue} 
              onChange={e => {
                let val = e.target.value;
                if (type === 'number') {
                  if (!allowNegative) {
                    val = val.replace(/[^0-9.]/g, '');
                  } else {
                    val = val.replace(/[^\-0-9.]/g, '');
                  }
                  // ensure at most one dot
                  const parts = val.split('.');
                  if (parts.length > 2) {
                    val = parts[0] + '.' + parts.slice(1).join('');
                  }
                }
                setTempValue(val);
              }} 
              inputMode={type === "number" ? "decimal" : undefined}
              min={type === 'number' && !allowNegative ? "0" : undefined}
              onKeyDown={e => {
                if (e.key === 'Enter') handleApply();
                if (e.key === 'Escape') handleCancel();
              }}
              autoFocus={isEditing && overrideValue === null}
              id={`input-${testId}`}
              data-testid={`input-${testId}`}
            />
            {currencyLabel && <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground pointer-events-none">{currencyLabel}</span>}
          </div>
          <button type="button" onClick={handleApply} className="flex-shrink-0 h-8 px-3 rounded-md bg-primary text-primary-foreground hover:opacity-90 text-xs font-bold transition-colors" data-testid={`button-apply-${testId}`}>Apply</button>
          <button type="button" onClick={handleCancel} className="flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-md bg-muted text-muted-foreground hover:text-foreground text-xs font-bold transition-colors" aria-label="Cancel" data-testid={`button-cancel-${testId}`}><X size={14} /></button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button type="button" className={cn("flex min-w-0 items-center justify-between min-h-[32px] py-1.5 px-2.5 flex-1 bg-muted/30 border rounded-md group transition-colors", overrideValue !== null ? "border-amber-500/50 text-amber-600" : "border-transparent hover:border-border")} onClick={enableEdit} data-testid={`button-edit-${testId}`}>
            <span className={cn("min-w-0 flex-1 text-sm font-medium flex items-center gap-1.5 text-left", isHashOrRef ? "break-all" : "truncate")}>
              {overrideValue !== null ? overrideValue : originalValue ? originalValue : <span className="text-muted-foreground italic">None</span>} 
              {(overrideValue !== null || originalValue) && currencyLabel && <span className="text-xs font-bold opacity-70">{currencyLabel}</span>}
            </span>
            <span className="opacity-0 group-hover:opacity-100 text-xs font-bold transition-opacity flex items-center gap-1">
              <Pencil size={12} /> Edit
            </span>
          </button>
          {overrideValue !== null && (
            <button type="button" onClick={handleReset} className="flex-shrink-0 h-8 px-2.5 rounded-md bg-destructive/10 text-destructive hover:bg-destructive/20 text-xs font-bold transition-colors" data-testid={`button-reset-${testId}`}>Reset</button>
          )}
        </div>
      )}
      {overrideValue !== null && originalValue !== null && (
        <div className="text-[10px] text-muted-foreground flex items-center gap-1" data-testid={`text-original-${testId}`}>
          Original: <span className="font-mono">{originalValue}</span> {currencyLabel}
        </div>
      )}
    </div>
  );
}
