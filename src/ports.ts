import type { Result } from './domain/result'
import type {
  GpuType,
  Image,
  ImageKind,
  Instance,
  Machine,
  PriceQuote,
  Region,
  Session,
} from './domain/types'

/** Idle GPUs of one model that the platform reports as rentable in one region. */
export type IdleCount = { regionId: string; gpuName: string; idle: number }

export type MachineQuery = {
  regionSigns: string[]
  gpuNames: string[]
  gpuCount: number
  /** Pages to read at most. Rentable hosts are not guaranteed to come first, so one page is only a sample. */
  maxPages: number
}

/** complete is false when the platform has more matching hosts than were read. */
export type MachineList = { machines: Machine[]; total: number; complete: boolean }

export type PriceRequest = { machineId: string; gpuCount: number; expandBytes: number }

export type CreateRequest = { machineId: string; gpuCount: number; image: Image; expandBytes: number }

/** Everything the script needs from AutoDL. Implemented by the real adapter and by the simulator. */
export type AutodlApi = {
  getSession: () => Session
  listRegions: () => Promise<Result<Region[]>>
  listGpuTypes: () => Promise<Result<GpuType[]>>
  getMemberLevel: () => Promise<Result<string>>
  listImages: (kind: ImageKind) => Promise<Result<Image[]>>
  /** The per-model idle counts the market page shows next to each GPU model. One small request per region. */
  countIdleGpus: (regions: Region[]) => Promise<Result<IdleCount[]>>
  /** Hosts matching the query in the platform's default order. Sold-out hosts are included. */
  listMachines: (query: MachineQuery) => Promise<Result<MachineList>>
  getMachine: (machineId: string, regionSign: string) => Promise<Result<Machine | null>>
  isMachineOnline: (machineId: string) => Promise<Result<boolean>>
  countInstances: () => Promise<Result<number>>
  previewPrice: (request: PriceRequest) => Promise<Result<PriceQuote>>
  /** Creates and powers on a pay-as-you-go instance. Resolves to the new instance id. */
  createInstance: (request: CreateRequest) => Promise<Result<string>>
  listInstances: () => Promise<Result<Instance[]>>
}

/** A create request that was sent and whose result has not been confirmed yet. */
export type PendingCreate = { sentAt: number; machineId: string; knownInstanceIds: string[] }

export type PendingCreateStore = {
  load: () => PendingCreate | null
  save: (pending: PendingCreate) => void
  clear: () => void
}

/** Guarantees that only one browser tab runs a task. Resolves to a release function, or null when taken. */
export type TabLock = { acquire: () => Promise<(() => void) | null> }

export type Notifier = (title: string, body: string) => void
