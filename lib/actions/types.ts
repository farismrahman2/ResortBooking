export type ActionResult =
  | { success: true }
  | { success: false; error: string }

export type ActionData<T> =
  | { success: true; data: T }
  | { success: false; error: string }
