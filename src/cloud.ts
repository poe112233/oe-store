import { createWorkBuddyCloud } from '@tencent-ai/workbuddy-cloud-sdk'
import { publicConfig } from './config'

/**
 * 全局唯一的云服务客户端：Auth / Database / Storage / LLM 共用同一实例。
 * 两个参数都必须来自 publicConfig，缺一不可。
 */
export const cloud = createWorkBuddyCloud({
  endpoint: publicConfig.endpoint,
  publishableKey: publicConfig.publishableKey,
})
