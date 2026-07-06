import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AddPatientPage } from './add-patient.page';

describe('AddPatientPage', () => {
  let component: AddPatientPage;
  let fixture: ComponentFixture<AddPatientPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AddPatientPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
