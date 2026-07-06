import { ComponentFixture, TestBed } from '@angular/core/testing';
import { AdditionalTestPage } from './additional-test.page';

describe('AdditionalTestPage', () => {
  let component: AdditionalTestPage;
  let fixture: ComponentFixture<AdditionalTestPage>;

  beforeEach(() => {
    fixture = TestBed.createComponent(AdditionalTestPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
