// @vitest-environment jsdom

import React, { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CharacterPromptTextarea } from '@/components/workspace/CharacterPromptTextarea'
import type { PromptCharacter } from '@/lib/character-prompt-completion'

const characters = [
  { name: '林舟', aliases: ['小舟'] },
  { name: '林月' },
  { name: '沈月' },
  { name: 'Anna Smith', aliases: ['Annie'] },
]

function Harness({ initial = '', options = characters, onKeyDown = vi.fn() }: {
  initial?: string
  options?: PromptCharacter[]
  onKeyDown?: React.KeyboardEventHandler<HTMLTextAreaElement>
}) {
  const [value, setValue] = useState(initial)
  return <CharacterPromptTextarea aria-label="指令" value={value} onValueChange={setValue} characters={options} onKeyDown={onKeyDown} />
}

function input() { return screen.getByRole('textbox', { name: '指令' }) as HTMLTextAreaElement }
function change(value: string, caret = value.length) {
  fireEvent.change(input(), { target: { value, selectionStart: caret, selectionEnd: caret } })
}

afterEach(cleanup)

describe('character prompt completion', () => {
  it('completes a Chinese name inside a sentence and preserves both sides and the caret', () => {
    render(<Harness />)
    change('让林先离开', 2)
    expect(screen.getAllByRole('option')).toHaveLength(2)
    fireEvent.keyDown(input(), { key: 'ArrowDown' })
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(input()).toHaveValue('让林月先离开')
    expect(input().selectionStart).toBe(3)
    expect(input()).toHaveFocus()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('matches aliases, removes the @ trigger, and keeps a canonical name in the prompt', () => {
    render(<Harness />)
    change('让@小舟')
    fireEvent.click(screen.getByRole('option', { name: '林舟 小舟' }))
    expect(input()).toHaveValue('让林舟')
    change('让＠沈')
    fireEvent.keyDown(input(), { key: 'Tab' })
    expect(input()).toHaveValue('让沈月')
  })

  it('offers the full list through @ or the insert button and replaces selected text', async () => {
    render(<Harness />)
    change('@')
    expect(screen.getAllByRole('option')).toHaveLength(4)
    fireEvent.keyDown(input(), { key: 'Escape' })
    change('让主角离开', 3)
    await act(async () => {
      input().setSelectionRange(1, 3)
      fireEvent.select(input())
    })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '插入角色' }))
    fireEvent.click(screen.getByRole('option', { name: '沈月' }))
    expect(input()).toHaveValue('让沈月离开')
    expect(input().selectionStart).toBe(3)
  })

  it('does not intercept Chinese IME confirmation or submit shortcuts', () => {
    const onKeyDown = vi.fn()
    render(<Harness onKeyDown={onKeyDown} />)
    fireEvent.compositionStart(input())
    change('让林')
    fireEvent.keyDown(input(), { key: 'Enter', isComposing: true, keyCode: 229 })
    expect(input()).toHaveValue('让林')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    fireEvent.compositionEnd(input())
    expect(screen.getAllByRole('option')).toHaveLength(2)
    fireEvent.keyDown(input(), { key: 'Enter', ctrlKey: true })
    expect(input()).toHaveValue('让林')
    expect(onKeyDown).toHaveBeenCalledTimes(2)
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(input()).toHaveValue('让林舟')
  })

  it('closes suggestions with Escape without closing a containing dialog', () => {
    const onEscape = vi.fn()
    render(<div onKeyDown={onEscape}><Harness /></div>)
    change('林')
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    expect(onEscape).not.toHaveBeenCalled()
    fireEvent.keyDown(input(), { key: 'Escape' })
    expect(onEscape).toHaveBeenCalledTimes(1)
  })

  it('uses Latin word boundaries and case-insensitive matching', () => {
    render(<Harness />)
    change('Plan a banana')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    change('Ask ann')
    fireEvent.keyDown(input(), { key: 'Enter' })
    expect(input()).toHaveValue('Ask Anna Smith')
  })

  it('does not suggest completed names or leave stale results when options change', () => {
    const { rerender } = render(<Harness />)
    change('让林舟')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    change('林')
    expect(screen.getByRole('listbox')).toBeInTheDocument()
    rerender(<Harness options={[{ name: '沈月' }]} />)
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })

  it('hides assistance with no available characters and dismisses it on blur', () => {
    const { rerender } = render(<Harness options={[]} />)
    change('自定义角色')
    expect(input()).toHaveValue('自定义角色')
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    rerender(<Harness />)
    change('林')
    fireEvent.blur(input(), { relatedTarget: null })
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
  })
})
