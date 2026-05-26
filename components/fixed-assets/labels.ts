import type { AssetCondition, AssetStatus, MaintenanceType, DisposalMethod, LocationType } from '@/lib/supabase/types-fixed-assets'

export const CONDITION_LABELS: Record<AssetCondition, string> = {
  excellent: 'Excellent', good: 'Good', fair: 'Fair', poor: 'Poor',
  needs_repair: 'Needs Repair', out_of_service: 'Out of Service',
}
export const CONDITION_BADGE: Record<AssetCondition, string> = {
  excellent:      'bg-emerald-50 text-emerald-700',
  good:           'bg-green-50 text-green-700',
  fair:           'bg-amber-50 text-amber-700',
  poor:           'bg-orange-50 text-orange-700',
  needs_repair:   'bg-red-50 text-red-700',
  out_of_service: 'bg-gray-200 text-gray-700',
}

export const STATUS_LABELS: Record<AssetStatus, string> = {
  active: 'Active', disposed: 'Disposed', lost: 'Lost', stolen: 'Stolen',
}
export const STATUS_BADGE: Record<AssetStatus, string> = {
  active:   'bg-zinc-100 text-zinc-700',
  disposed: 'bg-blue-50 text-blue-700',
  lost:     'bg-red-50 text-red-700',
  stolen:   'bg-red-100 text-red-800',
}

export const MAINTENANCE_TYPE_LABELS: Record<MaintenanceType, string> = {
  preventive: 'Preventive', corrective: 'Corrective', inspection: 'Inspection',
  warranty: 'Warranty', amc: 'AMC', installation: 'Installation', upgrade: 'Upgrade', other: 'Other',
}

export const DISPOSAL_METHOD_LABELS: Record<DisposalMethod, string> = {
  sold: 'Sold', scrapped: 'Scrapped', donated: 'Donated', traded_in: 'Traded In',
  lost: 'Lost', written_off: 'Written Off',
}

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  guest_room: 'Guest Room', common_area: 'Common Area', kitchen: 'Kitchen', restaurant: 'Restaurant',
  office: 'Office', laundry: 'Laundry', storage: 'Storage', outdoor: 'Outdoor', plant_room: 'Plant Room',
  vehicle: 'Vehicle', staff_quarters: 'Staff Quarters', other: 'Other',
}
