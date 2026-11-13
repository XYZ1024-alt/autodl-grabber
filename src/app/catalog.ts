import { ok, type Result } from '../domain/result'
import type { Catalog } from '../domain/types'
import type { AutodlApi } from '../ports'
import { describeFailure } from '../runner/runner'

export type CatalogLoad = { catalog: Catalog; warnings: string[] }

/** Loads everything the panel offers for selection. */
export const loadCatalog = async (api: AutodlApi): Promise<Result<CatalogLoad>> => {
  const [regions, gpuTypes, officialImages, privateImages, memberLevel] = await Promise.all([
    api.listRegions(),
    api.listGpuTypes(),
    api.listImages('official'),
    api.listImages('private'),
    api.getMemberLevel(),
  ])
  if (!regions.ok) return regions
  if (!gpuTypes.ok) return gpuTypes
  if (!officialImages.ok) return officialImages
  const warnings: string[] = []
  if (!privateImages.ok) warnings.push(`无法读取自定义镜像列表：${describeFailure(privateImages.failure)}`)
  if (!memberLevel.ok)
    warnings.push(
      `无法读取会员等级，筛选时按主机原价估算（创建前仍以平台预览价为准）：${describeFailure(memberLevel.failure)}`,
    )
  return ok({
    catalog: {
      regions: regions.value,
      gpuTypes: gpuTypes.value,
      officialImages: officialImages.value,
      privateImages: privateImages.ok ? privateImages.value : [],
      memberLevel: memberLevel.ok ? memberLevel.value : '',
    },
    warnings,
  })
}
