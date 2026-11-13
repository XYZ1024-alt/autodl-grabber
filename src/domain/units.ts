export const GIB = 1024 ** 3

export const gbToBytes = (gb: number): number => gb * GIB

export const bytesToGb = (bytes: number): number => bytes / GIB

/** AutoDL prices are integers in 1/1000 CNY. */
export const yuanToMilli = (yuan: number): number => Math.round(yuan * 1000)

export const formatYuan = (milli: number, digits = 2): string => `￥${(milli / 1000).toFixed(digits)}`

export const formatGb = (bytes: number): string => `${Math.round(bytesToGb(bytes) * 100) / 100} GB`
