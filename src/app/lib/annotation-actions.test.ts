import { test } from 'node:test'
import assert from 'node:assert/strict'
import { nextStatusAfterReview, canEditAnnotation } from './annotation/lifecycle'

test('review only moves submitted annotations', () => {
  assert.equal(nextStatusAfterReview('submitted', 'approved'), 'approved')
  assert.equal(nextStatusAfterReview('approved', 'approved'), 'approved')
  assert.equal(nextStatusAfterReview('draft', 'approved'), 'draft')
})

test('only draft and submitted annotations are editable', () => {
  assert.equal(canEditAnnotation('draft'), true)
  assert.equal(canEditAnnotation('submitted'), true)
  assert.equal(canEditAnnotation('approved'), false)
  assert.equal(canEditAnnotation('rejected'), false)
})
