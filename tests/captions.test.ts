import { describe, it, expect } from 'vitest'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { parseVtt, fetchCaptions } from '@/lib/youtube/captions'

const VTT = `WEBVTT
Kind: captions
Language: ko

00:00:00.000 --> 00:00:02.000 align:start position:0%
남자 심리는<00:00:01.000><c> 알다가도</c>

00:00:02.000 --> 00:00:04.000
남자 심리는 알다가도

00:00:04.000 --> 00:00:06.000
모르겠어요 ㅠㅠ
`
describe('parseVtt', () => {
  it('strips cues, inline tags and consecutive duplicates', () => {
    expect(parseVtt(VTT)).toBe('남자 심리는 알다가도 모르겠어요 ㅠㅠ')
  })
})
describe('fetchCaptions', () => {
  it('returns none when yt-dlp is missing', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'cap-'))
    const exec = async () => { throw Object.assign(new Error('spawn yt-dlp ENOENT'), { code: 'ENOENT' }) }
    expect(await fetchCaptions('abc', { outDir, exec })).toEqual({ text: '', source: 'none' })
  })
  it('returns none when yt-dlp ran but produced no file', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'cap-'))
    expect(await fetchCaptions('abc', { outDir, exec: async () => ({ code: 0, stderr: '' }) })).toEqual({ text: '', source: 'none' })
  })
  it('parses the produced file and truncates to maxChars', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'cap-'))
    const exec = async () => { writeFileSync(path.join(outDir, 'abc.ko.vtt'), VTT); return { code: 0, stderr: '' } }
    const r = await fetchCaptions('abc', { outDir, exec, maxChars: 10 })
    expect(r).toEqual({ text: '남자 심리는 알다가', source: 'subtitle' })
  })
  it('skips yt-dlp when the file is cached', async () => {
    const outDir = mkdtempSync(path.join(tmpdir(), 'cap-'))
    writeFileSync(path.join(outDir, 'abc.ko.vtt'), VTT)
    let called = false
    await fetchCaptions('abc', { outDir, exec: async () => { called = true; return { code: 0, stderr: '' } } })
    expect(called).toBe(false)
  })
})
