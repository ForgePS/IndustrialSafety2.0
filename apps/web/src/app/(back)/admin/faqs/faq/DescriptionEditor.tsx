'use client'

// React Imports
import { useCallback, useEffect } from 'react'

// Third-party Imports
import { useEditor, EditorContent } from '@tiptap/react'
import { StarterKit } from '@tiptap/starter-kit'
import { Underline } from '@tiptap/extension-underline'
import { Placeholder } from '@tiptap/extension-placeholder'
import { Link } from '@tiptap/extension-link'
import type { Editor } from '@tiptap/core'
import { TbBold, TbItalic, TbLink, TbList, TbListNumbers, TbStrikethrough, TbUnderline, TbUnlink } from 'react-icons/tb'
import { Button } from '@repo/ui/components/ui/button'
import { cn } from '@repo/ui/lib/utils'

// Styles Imports
import '../../faqs/tiptapEditor.css'

const EditorToolbar = ({ editor }: { editor: Editor | null }) => {
  // Function to set a link
  const setLink = useCallback(() => {
    const previousUrl = editor?.getAttributes('link').href
    const url = window.prompt('URL', previousUrl)

    // cancelled
    if (url === null) {
      return
    }

    // empty
    if (url === '') {
      editor?.chain().focus().extendMarkRange('link').unsetLink().run()

      return
    }

    // update link
    editor?.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  if (!editor) return null

  return (
    <div className='plb-3 pli-5 flex flex-wrap gap-x-3 gap-y-1'>
      <Button
        type='button'
        variant='ghostPrimary'
        size='icon'
        {...(editor.isActive('bold') && { color: 'primary' })}
        onClick={() => editor.chain().focus().toggleBold().run()}
        className={cn(editor.isActive('bold') && 'bg-primary/20')}
      >
        <TbBold className={cn('size-5', `${editor.isActive('bold') ? '' : 'text-textSecondary'}`)} />
      </Button>
      <Button
        type='button'
        variant='ghostPrimary'
        size='icon'
        {...(editor.isActive('underline') && { color: 'primary' })}
        onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={cn(editor.isActive('underline') && 'bg-primary/20')}
      >
        <TbUnderline className={cn('size-5', `${editor.isActive('underline') ? '' : 'text-textSecondary'}`)} />
      </Button>
      <Button
        type='button'
        variant='ghostPrimary'
        size='icon'
        {...(editor.isActive('italic') && { color: 'primary' })}
        onClick={() => editor.chain().focus().toggleItalic().run()}
        className={cn(editor.isActive('italic') && 'bg-primary/20')}
      >
        <TbItalic className={cn('size-5', `${editor.isActive('italic') ? '' : 'text-textSecondary'}`)} />
      </Button>
      <Button
        type='button'
        variant='ghostPrimary'
        size='icon'
        {...(editor.isActive('strike') && { color: 'primary' })}
        onClick={() => editor.chain().focus().toggleStrike().run()}
        className={cn(editor.isActive('strike') && 'bg-primary/20')}
      >
        <TbStrikethrough className={cn('size-5', `${editor.isActive('strike') ? '' : 'text-textSecondary'}`)} />
      </Button>
      <Button
        type='button'
        variant='ghostPrimary'
        size='icon'
        {...(editor.isActive('bulletList') && { color: 'primary' })}
        onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={cn(editor.isActive('bulletList') && 'bg-primary/20')}
      >
        <TbList className={cn('size-5', `${editor.isActive('bulletList') ? '' : 'text-textSecondary'}`)} />
      </Button>
      <Button
        type='button'
        variant='ghostPrimary'
        size='icon'
        {...(editor.isActive('orderedList') && { color: 'primary' })}
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={cn(editor.isActive('orderedList') && 'bg-primary/20')}
      >
        <TbListNumbers className={cn('size-5', `${editor.isActive('orderedList') ? '' : 'text-textSecondary'}`)} />
      </Button>
      <Button
        type='button'
        variant='ghostPrimary'
        size='icon'
        onClick={setLink}
        className={cn(editor.isActive('link') && 'bg-primary/20')}
      >
        <TbLink className={cn('size-5', `${editor.isActive('link') ? '' : 'text-textSecondary'}`)} />
      </Button>
      <Button
        type='button'
        variant='ghostPrimary'
        size='icon'
        onClick={() => editor.chain().focus().unsetLink().run()}
        disabled={!editor.isActive('link')}
      >
        <TbUnlink className='text-textSecondary size-5' />
      </Button>
    </div>
  )
}

const DescriptionEditor = ({
  editorContent,
  setEditorContent
}: {
  editorContent: string
  setEditorContent: (content: string) => void
}) => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        bulletList: {
          keepMarks: true,
          keepAttributes: false
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false
        }
      }),
      Placeholder.configure({
        placeholder: 'Write something here...'
      }),
      Link.configure({
        openOnClick: true,
        autolink: true,
        defaultProtocol: 'https'
      }),
      Underline
    ],
    content: editorContent,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const content = editor.getHTML()

      setEditorContent(content)
    }
  })

  // To render the editor content
  useEffect(() => {
    if (editor && editorContent !== editor.getHTML()) {
      editor.commands.setContent(editorContent)
    }
  }, [editor, editorContent])

  return (
    <div className='border-input rounded-lg border'>
      <EditorToolbar editor={editor} />
      <hr className='border-input' />
      <EditorContent editor={editor} className='bs-[135px] flex overflow-y-auto' />
    </div>
  )
}

export default DescriptionEditor
