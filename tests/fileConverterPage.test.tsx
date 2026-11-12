import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import React from 'react'
import { I18nProvider } from '../src/i18n/I18nProvider'
import FileConverter, { detectCategory } from '../src/pages/FileConverter'

let progressCb: ((info: any) => void) | null = null

function mockApi(picked: string[]) {
  const files = {
    converterCapabilities: vi.fn(async () => ({ ffmpeg: true, hwEncoders: ['h264_nvenc', 'hevc_nvenc', 'av1_nvenc'], gpuVendors: ['nvenc'], libreoffice: { available: true, bundled: true }, texconv: true, raw: true, cpuThreads: 16, imageInputs: [], imageOutputs: [], ddsFormats: ['BC1', 'BC3', 'BC4', 'BC5', 'BC6H', 'BC7', 'RGBA'], mediaOutputs: [], docInputs: [] })),
    docTargets: vi.fn(async (exts: string[]) => ({ outputs: exts.includes('xlsx') ? ['pdf', 'html'] : ['pdf', 'docx', 'odt', 'txt'] })),
    onConvertProgress: vi.fn((cb: any) => { progressCb = cb; return () => { progressCb = null } }),
    convertMedia: vi.fn(async (p: any) => {
      act(() => progressCb?.({ jobId: p.jobId, kind: 'media', index: 0, total: 1, inputFile: p.inputFiles[0], stage: 'encode', percent: 42, speed: 5.1, hardware: 'nvenc', encoder: 'h264_nvenc' }))
      return [{ inputFile: p.inputFiles[0], outputFile: 'C:\\out\\clip.mp4', ok: true, encoder: 'h264_nvenc', hardware: 'nvenc', seconds: 9.5, bytes: 24 * 1048576 }]
    }),
    convertImages: vi.fn(async (p: any) => p.inputFiles.map((f: string) => ({ inputFile: f, outputFile: 'C:\\out\\a.dds', ok: true }))),
    convertDocuments: vi.fn(async (p: any) => p.inputFiles.map((f: string) => ({ inputFile: f, outputFile: 'C:\\out\\a.pdf', ok: true, engine: 'lo' }))),
    cancelConvert: vi.fn(async () => ({ ok: true })),
    archiveOperation: vi.fn()
  }
  ;(window as any).darkhub = {
    files,
    dialog: { selectFiles: vi.fn(async () => ({ canceled: false, filePaths: picked })), selectFolder: vi.fn(), grantDroppedFiles: vi.fn() }
  }
  return files
}

const pick = async () => fireEvent.click(screen.getAllByRole('button', { name: /Selecionar arquivos/ })[0])

describe('File Converter page', () => {
  beforeEach(() => {
    cleanup()
    const store = new Map<string, string>([['darkhub.lang', 'pt-BR']])
    vi.stubGlobal('localStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, String(v)), removeItem: (k: string) => store.delete(k), clear: () => store.clear() })
  })

  it('routes inputs to the right category', () => {
    expect(detectCategory('C:\\a\\tex.DDS')).toBe('image')
    expect(detectCategory('photo.cr3')).toBe('image')
    expect(detectCategory('movie.m2ts')).toBe('video')
    expect(detectCategory('song.flac')).toBe('audio')
    expect(detectCategory('deck.pptx')).toBe('document')
    expect(detectCategory('backup.tar.gz')).toBe('archive')
  })

  it('video: shows the detected GPU, sends the encoder options and shows progress and the GPU result', async () => {
    const api = mockApi(['C:\\v\\clip.mkv'])
    render(<I18nProvider><FileConverter /></I18nProvider>)
    await pick()
    expect(await screen.findByText(/GPU detectada: h264_nvenc/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'HEVC' }))
    fireEvent.change(screen.getByLabelText('Resolução máxima'), { target: { value: '720' } })
    fireEvent.click(screen.getByRole('button', { name: /Converter agora/ }))
    await waitFor(() => expect(api.convertMedia).toHaveBeenCalled())
    const payload = api.convertMedia.mock.calls[0][0]
    expect(payload).toMatchObject({ inputFiles: ['C:\\v\\clip.mkv'], outputDir: 'C:\\v', outputFormat: 'mp4', codec: 'hevc', maxHeight: 720, quality: 'balanced', encoderPref: 'auto', copy: 'auto', responsive: true })
    expect(payload.jobId).toMatch(/^conv-/)
    expect(await screen.findByText(/GPU h264_nvenc · 9.5s · 24.0 MB/)).toBeTruthy()
  })

  it('images: DDS exposes BC formats, sRGB and mipmaps', async () => {
    const api = mockApi(['C:\\i\\albedo.png'])
    render(<I18nProvider><FileConverter /></I18nProvider>)
    await pick()
    fireEvent.click(await screen.findByRole('radio', { name: /DDS/ }))
    fireEvent.change(screen.getByLabelText('Compressão DDS'), { target: { value: 'BC5' } })
    fireEvent.click(screen.getByLabelText(/Gerar mipmaps/))
    fireEvent.click(screen.getByRole('button', { name: /Converter agora/ }))
    await waitFor(() => expect(api.convertImages).toHaveBeenCalled())
    expect(api.convertImages.mock.calls[0][0]).toMatchObject({ outputFormat: 'dds', ddsFormat: 'BC5', srgb: true, mipmaps: false })
  })

  it('documents: offers only the outputs the queue can reach and says LibreOffice is bundled', async () => {
    const api = mockApi(['C:\\d\\report.docx', 'C:\\d\\sheet.xlsx'])
    render(<I18nProvider><FileConverter /></I18nProvider>)
    await pick()
    expect(await screen.findByText('LibreOffice embutido pronto')).toBeTruthy()
    await waitFor(() => expect(api.docTargets).toHaveBeenCalledWith(['docx', 'xlsx']))
    const radios = await screen.findAllByRole('radio')
    expect(radios.map((r) => r.textContent?.slice(0, 4))).toEqual(['PDFD', 'HTML'])
    fireEvent.click(screen.getByRole('button', { name: /Converter agora/ }))
    await waitFor(() => expect(api.convertDocuments).toHaveBeenCalled())
    expect(api.convertDocuments.mock.calls[0][0].outputFormat).toBe('pdf')
  })
})
