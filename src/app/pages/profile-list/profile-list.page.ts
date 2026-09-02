import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

import {
  IonHeader,
  IonToolbar,
  IonButtons,
  IonBackButton,
  IonTitle,
  IonContent,
  IonRefresher,
  IonRefresherContent,
  IonIcon,
  IonButton,
  IonModal
} from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';

import {
  searchOutline,
  listOutline,
  refreshOutline,
  eyeOutline,
  closeOutline,
  documentTextOutline,
  downloadOutline
} from 'ionicons/icons';

import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

import {
  Capacitor,
  registerPlugin
} from '@capacitor/core';

import { LabApiService } from '../../core/services/lab-api';
import { AuthService } from '../../core/services/auth';
import { RoleService } from '../../core/services/role';
import { ToastService } from '../../core/services/toast';


/**
 * ============================================================
 * NATIVE PDF DOWNLOAD PLUGIN
 * ============================================================
 */

interface PdfDownloadPlugin {

  savePdf(options: {
    fileName: string;
    data: string;
  }): Promise<{
    success: boolean;
    uri: string;
    fileName: string;
    location: string;
  }>;

}

const PdfDownload =
  registerPlugin<PdfDownloadPlugin>(
    'PdfDownload'
  );


/**
 * ============================================================
 * PROFILE LIST ITEM
 * ============================================================
 */

interface ProfileListItem {

  profileId: number;

  profileName: string;

  assignedPrice: number;

  mrp: number;

  testCount: number;

  sampleTypes: string[];

  testNames: string[];

}


/**
 * ============================================================
 * ROLE
 * ============================================================
 */

const ROLE = {

  LAB_ADMIN: 'ROLE_LAB_ADMIN',

  STAFF: 'ROLE_STAFF',

  FRANCHISE: 'ROLE_FRANCHISE',

  FRANCHISE_STAFF: 'ROLE_FRANCHISE_STAFF'

} as const;


/**
 * ============================================================
 * COMPONENT
 * ============================================================
 */

@Component({

  selector: 'app-test-profile-list',

  standalone: true,

  templateUrl: './profile-list.page.html',

  styleUrls: ['./profile-list.page.scss'],

  imports: [

    CommonModule,
    FormsModule,

    IonHeader,
    IonToolbar,
    IonButtons,
    IonBackButton,
    IonTitle,
    IonContent,

    IonRefresher,
    IonRefresherContent,

    IonIcon,
    IonButton,
    IonModal

  ]

})


export class ProfileListPage
  implements OnInit {


  // ============================================================
  // DATA
  // ============================================================

  private allProfiles:
    ProfileListItem[] = [];

  filteredProfiles:
    ProfileListItem[] = [];

  pagedProfiles:
    ProfileListItem[] = [];


  // ============================================================
  // LOADING
  // ============================================================

  isLoading = false;


  // ============================================================
  // SEARCH
  // ============================================================

  searchTerm = '';

  private searchDebounce:
    any = null;


  // ============================================================
  // PAGINATION
  // ============================================================

  private readonly batchSize = 20;

  visibleCount =
    this.batchSize;


  // ============================================================
  // DETAIL MODAL
  // ============================================================

  isDetailModalOpen = false;

  selectedProfile:
    ProfileListItem | null = null;


  // ============================================================
  // CONSTRUCTOR
  // ============================================================

  constructor(

    private labApi: LabApiService,

    private authService: AuthService,

    private roleService: RoleService,

    private toastService: ToastService

  ) {

    addIcons({

      'search-outline':
        searchOutline,

      'list-outline':
        listOutline,

      'refresh-outline':
        refreshOutline,

      'eye-outline':
        eyeOutline,

      'close-outline':
        closeOutline,

      'document-text-outline':
        documentTextOutline,

      'download-outline':
        downloadOutline

    });

  }


  // ============================================================
  // INIT
  // ============================================================

  ngOnInit(): void {

    this.loadProfiles();

  }


  // ============================================================
  // ROLE / PERMISSION
  // ============================================================

  get canViewAmount(): boolean {

    const role =
      this.authService.role;

    if (

      role === ROLE.STAFF ||

      role === ROLE.FRANCHISE_STAFF

    ) {

      return false;

    }

    return (

      role === ROLE.LAB_ADMIN ||

      role === ROLE.FRANCHISE

    );

  }


  get isAdminRole(): boolean {

    return this.roleService.isLabAdmin;

  }


  // ============================================================
  // LOAD PROFILES
  // ============================================================

  loadProfiles(): void {

    this.isLoading = true;

    const labId =
      this.authService.labId;

    const franchiseId =
      this.authService.franchiseId;


    forkJoin({

      tests:

        this.labApi
          .getTests(franchiseId)
          .pipe(
            catchError(() => of([]))
          ),

      profiles:

        this.labApi
          .getProfiles(
            labId,
            franchiseId
          )
          .pipe(
            catchError(() => of([]))
          )

    })

    .subscribe({

      next: ({
        tests,
        profiles
      }) => {

        const testsList =

          Array.isArray(tests)

            ? tests

            : (
                (tests as any)?.content || []
              );


        const testsById =
          this.buildTestsLookup(
            testsList
          );


        const profileList =

          Array.isArray(profiles)

            ? profiles

            : (
                (profiles as any)?.content || []
              );


        this.allProfiles =
          profileList.map(
            (p: any) =>
              this.mapProfile(
                p,
                testsById
              )
          );


        this.applySearch();

        this.isLoading = false;

      },

      error: (err) => {

        console.error(
          'TEST PROFILE LIST LOAD ERROR:',
          err
        );

        this.allProfiles = [];

        this.applySearch();

        this.isLoading = false;

      }

    });

  }


  // ============================================================
  // BUILD TEST LOOKUP
  // ============================================================

  private buildTestsLookup(
    testsList: any[]
  ): Map<
    number,
    {
      name: string;
      sampleType: string;
    }
  > {

    const map =
      new Map<
        number,
        {
          name: string;
          sampleType: string;
        }
      >();


    testsList.forEach(
      (t: any) => {

        const id =
          Number(
            t.testId ??
            t.test_id ??
            t.id ??
            0
          );


        if (!id) {
          return;
        }


        const name =
          String(
            t.test_name ??
            t.testName ??
            'Unnamed Test'
          ).trim();


        const sampleType =
          String(
            t.sampleTypeName ??
            t.sample_type_name ??
            t.sampleType ??
            (
              typeof t.sample_type === 'string'
                ? t.sample_type
                : ''
            ) ??
            ''
          )
          .trim()
          .toUpperCase();


        map.set(
          id,
          {
            name,
            sampleType
          }
        );

      }
    );


    return map;

  }


  // ============================================================
  // MAP PROFILE
  // ============================================================

  private mapProfile(
    p: any,
    testsById: Map<
      number,
      {
        name: string;
        sampleType: string;
      }
    >
  ): ProfileListItem {

    const rawTests: any[] =

      p.withTest ??
      p.tests ??
      p.testList ??
      p.profileTests ??
      [];


    const testNames:
      string[] = [];

    const sampleTypesSet =
      new Set<string>();


    rawTests.forEach(
      (pt: any) => {

        const testId =
          Number(

            pt?.testId ??
            pt?.test_id ??
            pt?.masterTestId ??
            pt?.testMasterId ??
            pt?.test?.testId ??
            pt?.test?.id ??
            pt?.id ??
            0

          );


        const match =
          testsById.get(testId);


        if (match) {

          testNames.push(
            match.name
          );


          if (match.sampleType) {

            sampleTypesSet.add(
              match.sampleType
            );

          }

        }

        else {

          const fallbackName =
            String(
              pt?.testName ??
              pt?.test_name ??
              ''
            ).trim();


          const fallbackSampleType =
            String(

              pt?.sampleTypeName ??
              pt?.sample_type_name ??
              pt?.sampleType ??
              (
                typeof pt?.sample_type === 'string'
                  ? pt.sample_type
                  : ''
              ) ??
              ''

            )
            .trim()
            .toUpperCase();


          if (fallbackName) {

            testNames.push(
              fallbackName
            );

          }


          if (fallbackSampleType) {

            sampleTypesSet.add(
              fallbackSampleType
            );

          }

          // ✅ FIX: he test getTests() (active franchise list) madhe
          // sapadla nahi (bahuteka inactive/deleted test), pan fallback
          // varun (pt cha raw testName/sampleType) tyala aadhich
          // testNames/sampleTypesSet madhe jodla ahe — tyamule
          // testCount/sample types barobarच rahtat. Ha ek expected
          // case ahe, error nahi, tyamule console.warn spam (jya
          // mule DevTools madhe khup "Issues" distat) kadhun taklay.

        }

      }
    );


    return {

      profileId:
        p.profileId ??
        p.profile_id ??
        p.id,


      profileName:
        String(
          p.profileName ??
          p.profile_name ??
          p.name ??
          'Unnamed Profile'
        ).trim(),


      assignedPrice:
        Number(
          p.profileAssignedPrice ??
          p.total_amount ??
          p.totalAmount ??
          0
        ) || 0,


      mrp:
        Number(
          p.mrp ??
          p.total_amount ??
          p.totalAmount ??
          0
        ) || 0,


      testCount:
        testNames.length,


      sampleTypes:
        Array.from(sampleTypesSet),


      testNames

    };

  }


  // ============================================================
  // SEARCH
  // ============================================================

  onSearchChange(): void {

    if (this.searchDebounce) {

      clearTimeout(
        this.searchDebounce
      );

    }


    this.searchDebounce =
      setTimeout(
        () => {
          this.applySearch();
        },
        200
      );

  }


  // ============================================================
  // APPLY SEARCH
  // ============================================================

  applySearch(): void {

    const q =
      this.searchTerm
        .trim()
        .toLowerCase();


    this.filteredProfiles =

      !q

        ? [...this.allProfiles]

        : this.allProfiles.filter(
            p =>
              p.profileName
                .toLowerCase()
                .includes(q)

              ||

              p.testNames.some(
                n =>
                  n
                    .toLowerCase()
                    .includes(q)
              )
          );


    this.visibleCount =
      this.batchSize;


    this.updatePagedProfiles();

  }


  // ============================================================
  // TOTAL
  // ============================================================

  get totalEntries(): number {

    return this.filteredProfiles.length;

  }


  // ============================================================
  // HAS MORE
  // ============================================================

  get hasMore(): boolean {

    return (
      this.pagedProfiles.length <
      this.totalEntries
    );

  }


  // ============================================================
  // UPDATE PAGE
  // ============================================================

  private updatePagedProfiles(): void {

    this.pagedProfiles =
      this.filteredProfiles.slice(
        0,
        this.visibleCount
      );

  }


  // ============================================================
  // LOAD MORE
  // ============================================================

  loadMore(): void {

    this.visibleCount +=
      this.batchSize;

    this.updatePagedProfiles();

  }


  // ============================================================
  // OPEN DETAIL
  // ============================================================

  openDetail(
    item: ProfileListItem
  ): void {

    this.selectedProfile =
      item;

    this.isDetailModalOpen =
      true;

  }


  // ============================================================
  // CLOSE DETAIL
  // ============================================================

  closeDetail(): void {

    this.isDetailModalOpen =
      false;

    this.selectedProfile =
      null;

  }


  // ============================================================
  // REFRESH
  // ============================================================

  doRefresh(
    event: any
  ): void {

    this.loadProfiles();

    setTimeout(
      () => {
        event
          ?.target
          ?.complete();
      },
      400
    );

  }


  // ============================================================
  // COLORS
  // ============================================================

  private readonly badgePalette = [

    '#db0d0d',
    '#bb09d6',
    '#0d7fdb',
    '#0dbf6d',
    '#e08b0d',
    '#0dbcbf',
    '#c2185b',
    '#5c6bc0',
    '#8d6e63',
    '#546e7a'

  ];


  private hashColor(
    text: string
  ): string {

    let hash = 0;


    for (
      let i = 0;
      i < text.length;
      i++
    ) {

      hash =
        (
          hash * 31 +
          text.charCodeAt(i)
        ) >>> 0;

    }


    return this.badgePalette[
      hash % this.badgePalette.length
    ];

  }


  sampleColor(
    sampleType: string
  ): string {

    const known:
      Record<string, string> = {

        SERUM:
          '#db0d0d',

        EDTA:
          '#bb09d6',

        URINE:
          '#a3c910',

        CSF:
          '#7a0d1e',

        PUS:
          '#9acd00',

        TISSUE:
          '#e39fb0',

        SLIDE:
          '#f0b3c4',

        PLASMA:
          '#0d7fdb',

        SWAB:
          '#0dbf6d',

        'SODIUM FLUORIDE-1':
          '#8d6e63'

      };


    const key =
      sampleType.toUpperCase();


    return (
      known[key] ??
      this.hashColor(key)
    );

  }


  // ============================================================
  // PDF EXPORT
  // ============================================================

  async exportPdf(): Promise<void> {

    try {

      // ========================================================
      // CREATE PDF
      // ========================================================

      const doc =
        new jsPDF({
          orientation: 'landscape',
          unit: 'pt',
          format: 'a4'
        });


      const pageWidth =
        doc.internal.pageSize.getWidth();


      // ========================================================
      // TITLE
      // ========================================================

      doc.setFont(
        'helvetica',
        'bold'
      );

      doc.setFontSize(24);

      doc.setTextColor(
        20,
        20,
        20
      );


      doc.text(
        'Test Profile List',
        pageWidth / 2,
        46,
        {
          align: 'center'
        }
      );


      // ========================================================
      // FRANCHISE
      // ========================================================

      doc.setFont(
        'helvetica',
        'italic'
      );

      doc.setFontSize(12);

      doc.setTextColor(
        120,
        120,
        120
      );


      doc.text(

        `Franchise: ${
          this.authService.franchiseId ??
          'undefined'
        }`,

        pageWidth / 2,

        66,

        {
          align: 'center'
        }

      );


      // ========================================================
      // TABLE DATA
      // ========================================================

      const rows =
        this.filteredProfiles.map(
          (p, i) => [

            String(i + 1),

            p.profileName,

            this.canViewAmount
              ? String(p.assignedPrice)
              : '-',

            this.canViewAmount
              ? String(p.mrp)
              : '-',

            String(p.testCount),

            p.sampleTypes.join(', ') || '-',

            p.testNames.length
              ? p.testNames.join(',\n')
              : '-'

          ]
        );


      // ========================================================
      // TABLE
      // ========================================================

      autoTable(
        doc,
        {

          startY: 88,

          head: [[

            'Sr. No.',
            'Profile Name',
            'Assigned Price',
            'MRP Price',
            'Test Count',
            'Sample Type',
            'Tests Included'

          ]],

          body: rows,

          theme: 'grid',

          styles: {

            font: 'helvetica',

            fontSize: 10,

            cellPadding: 8,

            valign: 'top',

            lineColor: [
              221,
              221,
              221
            ],

            lineWidth: 0.5,

            textColor: [
              40,
              40,
              40
            ]

          },

          headStyles: {

            fillColor: [
              245,
              245,
              245
            ],

            textColor: [
              20,
              20,
              20
            ],

            fontStyle: 'bold',

            fontSize: 11,

            lineColor: [
              221,
              221,
              221
            ],

            lineWidth: 0.5

          },

          columnStyles: {

            0: {
              cellWidth: 45
            },

            1: {
              cellWidth: 85
            },

            2: {
              cellWidth: 85
            },

            3: {
              cellWidth: 70
            },

            4: {
              cellWidth: 65
            },

            5: {
              cellWidth: 110
            },

            6: {
              cellWidth: 'auto'
            }

          },

          didParseCell:
            (data) => {

              if (
                data.column.index === 0
              ) {

                data.cell.styles.halign =
                  'center';

              }


              if (

                data.column.index === 2 ||

                data.column.index === 3

              ) {

                data.cell.styles.halign =

                  data.section === 'body'

                    ? 'right'

                    : 'left';

              }

            }

        }
      );


      // ========================================================
      // FILE NAME
      // ========================================================

      const fileName =
        `Test_Profile_List_${Date.now()}.pdf`;


      // ========================================================
      // ANDROID / NATIVE
      // ========================================================

      const isNative =
        Capacitor.isNativePlatform();


      if (isNative) {

        console.log(
          'PDF EXPORT: Android native platform'
        );


        // ======================================================
        // PDF -> DATA URI
        // ======================================================

        const dataUri =
          doc.output(
            'datauristring'
          );


        if (
          !dataUri ||
          !dataUri.includes(',')
        ) {

          throw new Error(
            'Unable to convert PDF to Base64'
          );

        }


        // ======================================================
        // EXTRACT BASE64
        // ======================================================

        const base64Pdf =
          dataUri.substring(
            dataUri.indexOf(',') + 1
          );


        if (!base64Pdf) {

          throw new Error(
            'PDF Base64 data is empty'
          );

        }


        // ======================================================
        // ANDROID NATIVE PLUGIN
        // ======================================================

        const result =
          await PdfDownload.savePdf({

            fileName:
              fileName,

            data:
              base64Pdf

          });


        console.log(
          'PDF native result:',
          result
        );


        // ======================================================
        // SUCCESS
        // ======================================================

        if (
          result &&
          result.success === true
        ) {

          /*
           * IMPORTANT:
           * User ला file name, URI किंवा location
           * दाखवला जाणार नाही.
           *
           * Existing ToastService वापरून
           * Download Reports सारखाच toast दाखवला जाईल.
           */

          this.toastService.success(
            'PDF Downloaded',
            'Your PDF has been downloaded successfully.'
          );

          return;

        }


        throw new Error(
          'Unable to download PDF'
        );

      }


      // ========================================================
      // WEB / LAPTOP
      // ========================================================

      const blob =
        doc.output('blob');


      const blobUrl =
        URL.createObjectURL(blob);


      const newWindow =
        window.open(
          blobUrl,
          '_blank'
        );


      // ========================================================
      // POPUP BLOCKED
      // ========================================================

      if (!newWindow) {

        const link =
          document.createElement('a');


        link.href =
          blobUrl;


        link.download =
          fileName;


        document.body.appendChild(
          link
        );


        link.click();


        document.body.removeChild(
          link
        );

      }


      // ========================================================
      // WEB SUCCESS TOAST
      // ========================================================

      this.toastService.success(
        'PDF Downloaded',
        'Your PDF has been downloaded successfully.'
      );


      // ========================================================
      // CLEANUP
      // ========================================================

      setTimeout(
        () => {

          URL.revokeObjectURL(
            blobUrl
          );

        },
        60000
      );

    }

    catch (error: any) {

      console.error(
        'PDF EXPORT ERROR:',
        error
      );


      // ========================================================
      // ERROR TOAST
      // ========================================================

      const message =
        error?.message ||
        error?.error ||
        'Unable to download PDF';


      this.toastService.error(
        'PDF Download Failed',
        message
      );

    }

  }

}