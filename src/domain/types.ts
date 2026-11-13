/** A region as shown on the AutoDL market page. It groups several region signs. */
export type Region = { id: string; name: string; signs: string[] }

export type GpuType = { name: string; chipCorp: string; cpuArch: string; series: string }

export type ImageKind = 'official' | 'private'

export type Image = {
  kind: ImageKind
  uuid: string
  label: string
  /** CUDA version of the image, as the platform reports it ("12.8"). Empty when unknown. */
  cuda: string
  /** Chip vendor and CPU architecture the image was built for. Empty when the platform does not say. */
  chipCorp: string
  cpuArch: string
}

export type Machine = {
  id: string
  alias: string
  regionSign: string
  regionName: string
  gpuName: string
  gpuTotal: number
  /** GPUs rentable right now. 0 when the host is sold out, offline or has no instance slot left. */
  gpuIdle: number
  chipCorp: string
  cpuArch: string
  highestCuda: string
  /** "" | "Base N" (N GPUs minimum) | "Unit N" (multiples of N). */
  rentMode: string
  /** Pay-as-you-go list price of one GPU per hour, in 1/1000 CNY. */
  hourlyMilli: number
  /** Discounted price of one GPU per hour by member level name, in 1/1000 CNY. */
  hourlyMilliByLevel: Record<string, number>
  /** Free data disk that comes with every instance on this host. */
  freeDiskBytes: number
  /** Largest paid data disk expansion this host can still provide. */
  maxExpandBytes: number
  /** List price of paid data disk in 1/1000 CNY per GB per day, before member discount. */
  diskDailyMilliPerGb: number
}

/** What the platform says an instance will cost. All prices in 1/1000 CNY. */
export type PriceQuote = {
  /** Payable price of the whole instance per hour, after discounts. */
  hourlyMilli: number
  originHourlyMilli: number
  /** The expansion size the platform priced. Must equal the requested size. */
  expandBytes: number
  /** Payable price of the paid data disk per day, after discounts. */
  diskDailyMilli: number
}

export type Instance = {
  uuid: string
  machineId: string
  regionName: string
  gpuName: string
  gpuCount: number
  status: string
  chargeType: string
  hourlyMilli: number
  /** Paid data disk expansion of this instance. */
  expandBytes: number
  /** Total data disk size the platform reports, 0 when it does not report one yet. */
  dataDiskTotalBytes: number
  createdAt: string
}

export type Session = {
  loggedIn: boolean
  /** False for a sub-account without instance permission. */
  canCreate: boolean
  instanceLimit: number
}

export type Catalog = {
  regions: Region[]
  gpuTypes: GpuType[]
  officialImages: Image[]
  privateImages: Image[]
  memberLevel: string
}
