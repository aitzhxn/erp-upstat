import { createSlice, createAsyncThunk } from '@reduxjs/toolkit';
import type { PayloadAction } from '@reduxjs/toolkit';
import type { Employee, Department } from '@/types';
import { orgService } from '@/services/orgService';

interface OrgState {
  employees: Employee[];
  departments: Department[];
  selectedEmployee: Employee | null;
  loading: boolean;
  error: string | null;
}

const initialState: OrgState = {
  employees: [],
  departments: [],
  selectedEmployee: null,
  loading: false,
  error: null,
};

export const fetchEmployees = createAsyncThunk('org/fetchEmployees', async () => {
  return await orgService.getEmployees();
});

export const fetchDepartments = createAsyncThunk('org/fetchDepartments', async () => {
  return await orgService.getDepartments();
});

const orgSlice = createSlice({
  name: 'org',
  initialState,
  reducers: {
    setSelectedEmployee: (state, action: PayloadAction<Employee | null>) => {
      state.selectedEmployee = action.payload;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchEmployees.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchEmployees.fulfilled, (state, action) => {
        state.employees = action.payload;
        state.loading = false;
      })
      .addCase(fetchEmployees.rejected, (state, action) => {
        state.error = action.error.message || 'Failed to fetch employees';
        state.loading = false;
      });
  },
});

export const { setSelectedEmployee } = orgSlice.actions;
export default orgSlice.reducer;
