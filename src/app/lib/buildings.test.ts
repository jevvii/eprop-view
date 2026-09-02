import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { inspectionFormSchema } from './validators'

describe('Phase C: Building Master Data Hierarchy Tests', () => {
  describe('Inspection Form Schema Master Data Extensions', () => {
    test('inspectionFormSchema validates with optional building_id, floor_id, structural_element_id', () => {
      const validPayload = {
        project_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        inspection_date: '2026-09-02',
        location: 'Building A, Basement 1',
        floor: 'Basement 1',
        structural_element: 'column' as const,
        building_id: 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        floor_id: 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        structural_element_id: 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        risk_score: 5.5,
        status: 'in_progress' as const,
        notes: 'Shear crack inspection at column base',
      }

      const result = inspectionFormSchema.safeParse(validPayload)
      assert.equal(result.success, true)
      if (result.success) {
        assert.equal(result.data.building_id, 'b0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
        assert.equal(result.data.floor_id, 'c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
        assert.equal(result.data.structural_element_id, 'd0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')
      }
    })

    test('inspectionFormSchema remains backward compatible without foreign keys', () => {
      const legacyPayload = {
        project_id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
        inspection_date: '2026-09-02',
        location: 'Perimeter Wall',
        floor: 'Ground Floor',
        structural_element: 'wall' as const,
        risk_score: 3.0,
        status: 'pending' as const,
        notes: 'Visual survey',
      }

      const result = inspectionFormSchema.safeParse(legacyPayload)
      assert.equal(result.success, true)
    })
  })

  describe('Structural Elements CSV Schedule Parsing', () => {
    test('parses CSV schedule lines and maps columns correctly', () => {
      const csv = `identifier,element_type,description
Column C-1,column,Reinforced concrete column
Beam B-10,beam,Post-tensioned transfer beam
Wall SW-1,wall,Exterior core shear wall`

      const lines = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
      const header = lines[0].toLowerCase().split(',')
      const idIdx = header.indexOf('identifier')
      const typeIdx = header.indexOf('element_type')
      const descIdx = header.indexOf('description')

      assert.equal(idIdx, 0)
      assert.equal(typeIdx, 1)
      assert.equal(descIdx, 2)

      const parsedRows = lines.slice(1).map((line) => {
        const cols = line.split(',')
        return {
          identifier: cols[idIdx],
          element_type: cols[typeIdx],
          description: cols[descIdx],
        }
      })

      assert.equal(parsedRows.length, 3)
      assert.equal(parsedRows[0].identifier, 'Column C-1')
      assert.equal(parsedRows[0].element_type, 'column')
      assert.equal(parsedRows[1].identifier, 'Beam B-10')
      assert.equal(parsedRows[2].identifier, 'Wall SW-1')
    })
  })
})
