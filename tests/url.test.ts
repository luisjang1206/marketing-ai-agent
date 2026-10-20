import { describe, it, expect } from 'vitest'
import { parseVideoId } from '@/lib/youtube/url'
describe('parseVideoId', () => {
  it.each([
    ['https://youtu.be/akn-AvCeHBI', 'akn-AvCeHBI'],
    ['https://www.youtube.com/watch?v=JjY09DSdzx0&t=10s', 'JjY09DSdzx0'],
    ['https://youtube.com/shorts/DvxMfC_KjX0', 'DvxMfC_KjX0'],
    ['  https://m.youtube.com/watch?list=PL1&v=3K82-PjUeP0  ', '3K82-PjUeP0'],
    ['WxXlNTXQSd4', 'WxXlNTXQSd4'],
    ['https://www.youtube.com/live/WxXlNTXQSd4?feature=share', 'WxXlNTXQSd4'],
  ])('%s → %s', (input, id) => expect(parseVideoId(input)).toBe(id))
  it.each(['', 'https://example.com/watch?v=abc', 'https://www.youtube.com/channel/UCxlc0Ky0aWoD8uI09ad44Tg', 'short'])
    ('rejects %s', (input) => expect(parseVideoId(input)).toBeNull())
})
