/**
 * ROOM MAP — how the resort is laid out on the ground, for the Room board.
 * Display only: availability and pricing never read this.
 *
 * Each floor is a CSS grid: `cols` is grid-template-columns and `areas` the
 * grid-template-areas rows, one name per room ("r206") plus "cor" for a
 * corridor strip. Floors are listed top floor first, as they stack.
 * Taken from the owner's sketch (Oct 2026).
 */

export interface MapFloor {
  id:    string
  label: string
  cols:  string
  areas: string[]
}

export interface MapBuilding {
  id:     'west' | 'cottages' | 'main' | 'canopy'
  label:  string
  floors: MapFloor[]
}

const canopyFloor = (f: number): MapFloor => ({
  id: `canopy-${f}`, label: f === 1 ? 'Ground floor' : `Floor ${f}`,
  cols: 'repeat(5, minmax(0, 1fr))',
  // Left to right as on site: x15 … x11.
  areas: [`r${f}15 r${f}14 r${f}13 r${f}12 r${f}11`],
})

export const ROOM_MAP: MapBuilding[] = [
  {
    id: 'west', label: 'West Villa',
    floors: [{ id: 'west-g', label: 'Ground floor', cols: 'repeat(2, minmax(0, 1fr))', areas: ['r301 r302'] }],
  },
  {
    id: 'cottages', label: 'Cottages',
    floors: [{ id: 'cottages-g', label: 'Ground floor', cols: 'repeat(5, minmax(0, 1fr))', areas: ['r103 r104 r105 r106 r107'] }],
  },
  {
    id: 'main', label: 'Main Villa',
    floors: [
      {
        id: 'main-2', label: '2nd floor',
        // 206 205 | corridor | 202 203 (narrow) ; 207 (wide) | corridor | 204 (wide)
        cols: 'minmax(0, 1fr) minmax(0, 1fr) 10px minmax(0, .8fr) minmax(0, .8fr)',
        areas: ['r206 r205 cor r202 r203', 'r207 r207 cor r204 r204'],
      },
      { id: 'main-g', label: 'Ground floor', cols: 'repeat(3, minmax(0, 1fr))', areas: ['r108 r102 r101'] },
    ],
  },
  {
    id: 'canopy', label: 'Canopy',
    floors: [5, 4, 3, 2, 1].map(canopyFloor),
  },
]

/** Room numbers drawn on a floor, in reading order. */
export function floorRooms(floor: MapFloor): string[] {
  const out: string[] = []
  for (const row of floor.areas) for (const a of row.split(/\s+/)) {
    if (a.startsWith('r') && !out.includes(a.slice(1))) out.push(a.slice(1))
  }
  return out
}

/** Every room the map draws. */
export const MAPPED_ROOMS: string[] = ROOM_MAP.flatMap((b) => b.floors.flatMap(floorRooms))
